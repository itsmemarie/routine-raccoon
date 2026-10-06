import { isAuthError, type Session, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { normaliseEmail } from "@/domain/auth";
import { AppError, toAppError } from "@/lib/errors/app-error";
import type { ErrorCode } from "@/lib/errors/codes";
import { err, ok, type Result } from "@/lib/errors/result";
import { withTimeout } from "@/lib/net/timeout";
import { isNativePlatform } from "@/lib/platform/platform";
import { getSupabaseClient, type RaccoonSupabase } from "@/lib/supabase/client";

/**
 * Account gateway (TECH_SPEC §3.1, handoff "Account"). The only UI-initiated network calls in
 * the app go through here; every failure comes back as a coded AppError.
 */

export interface AccountUser {
  readonly id: string;
  readonly email: string;
  /** First name from sign-up or Google, or "" when unknown. */
  readonly name: string;
  readonly provider: "email" | "google";
}

export type CodePurpose = "signup" | "recovery";

const TIMEOUT_MS = 15_000;

/** Supabase Auth error codes we map to our own; everything else goes through toAppError. */
const AUTH_CODES: Readonly<Record<string, ErrorCode>> = {
  invalid_credentials: "RR-AUTH-001",
  over_request_rate_limit: "RR-AUTH-002",
  otp_expired: "RR-AUTH-003",
  otp_disabled: "RR-AUTH-003",
  session_not_found: "RR-AUTH-004",
  session_expired: "RR-AUTH-004",
  refresh_token_not_found: "RR-AUTH-004",
  refresh_token_already_used: "RR-AUTH-004",
  bad_jwt: "RR-AUTH-004",
  bad_oauth_state: "RR-AUTH-005",
  bad_oauth_callback: "RR-AUTH-005",
  bad_code_verifier: "RR-AUTH-005",
  flow_state_not_found: "RR-AUTH-005",
  flow_state_expired: "RR-AUTH-005",
  weak_password: "RR-AUTH-009",
  over_email_send_rate_limit: "RR-AUTH-010",
};

/** Maps Supabase Auth errors to ours; anything else (network, 5xx) via toAppError. */
export function mapAuthError(error: unknown, fallback: ErrorCode): AppError {
  if (isAuthError(error)) {
    const mapped = error.code ? AUTH_CODES[error.code] : undefined;
    if (mapped) return new AppError(mapped, { cause: error });
    // GoTrue reports a wrong or expired OTP as 403 without a specific code on some versions.
    if (error.status === 403 && /token|otp|code/i.test(error.message)) {
      return new AppError("RR-AUTH-003", { cause: error });
    }
  }
  return toAppError(error, fallback);
}

function client(): Result<RaccoonSupabase, AppError> {
  return getSupabaseClient();
}

function providerOf(user: User): "email" | "google" {
  const providers = new Set(
    [user.app_metadata.provider, ...(user.identities ?? []).map((i) => i.provider)].filter(
      (p): p is string => typeof p === "string",
    ),
  );
  return providers.has("email") || !providers.has("google") ? "email" : "google";
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value : "";
}

export function accountUserFrom(user: User): AccountUser {
  const meta = user.user_metadata;
  const name =
    metaString(meta, "first_name") ||
    metaString(meta, "given_name") ||
    (metaString(meta, "full_name") || metaString(meta, "name")).split(" ")[0] ||
    "";
  return { id: user.id, email: user.email ?? "", name: name ?? "", provider: providerOf(user) };
}

async function call<T>(
  fallback: ErrorCode,
  fn: (supabase: RaccoonSupabase) => Promise<T>,
): Promise<Result<T, AppError>> {
  const supabase = client();
  if (!supabase.ok) return supabase;
  try {
    return ok(await withTimeout(() => fn(supabase.value), TIMEOUT_MS));
  } catch (error) {
    return err(mapAuthError(error, fallback));
  }
}

const LookupSchema = z.object({
  exists: z.boolean(),
  providers: z.array(z.string()).default([]),
  first_name: z.string().nullable().default(null),
});

export interface LookupResult {
  readonly status: "known" | "google" | "new";
  readonly firstName: string | null;
}

/**
 * Email-first lookup (handoff: "Account found" / "Google account" / "New account"). Backed by
 * the rate-limited RPC `lookup_account`. Failure → RR-AUTH-006: the screen carries on without
 * the hint.
 */
export function lookupEmail(email: string): Promise<Result<LookupResult, AppError>> {
  return call("RR-AUTH-006", async (supabase) => {
    const { data, error } = await supabase.rpc("lookup_account", {
      p_email: normaliseEmail(email),
    });
    if (error) throw new AppError("RR-AUTH-006", { cause: error });
    const parsed = LookupSchema.safeParse(data);
    if (!parsed.success) throw new AppError("RR-AUTH-006", { cause: parsed.error });
    const { exists, providers, first_name } = parsed.data;
    const status = !exists
      ? "new"
      : providers.includes("google") && !providers.includes("email")
        ? "google"
        : "known";
    return { status, firstName: first_name };
  });
}

function signedIn(session: Session | null): AccountUser {
  if (!session) throw new AppError("RR-AUTH-004");
  return accountUserFrom(session.user);
}

export type SignInOutcome =
  | { readonly kind: "signed-in"; readonly user: AccountUser }
  /** The account exists but its email was never confirmed: a code was sent. */
  | { readonly kind: "needs-code" };

export function signInWithPassword(
  email: string,
  password: string,
): Promise<Result<SignInOutcome, AppError>> {
  return call("RR-AUTH-001", async (supabase) => {
    const address = normaliseEmail(email);
    const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
    if (error && isAuthError(error) && error.code === "email_not_confirmed") {
      const resent = await supabase.auth.resend({ type: "signup", email: address });
      if (resent.error) throw resent.error;
      return { kind: "needs-code" } as const;
    }
    if (error) throw error;
    return { kind: "signed-in", user: signedIn(data.session) } as const;
  });
}

export type SignUpOutcome =
  | { readonly kind: "code-sent" }
  /** Email confirmation is off for this project: the account is ready. */
  | { readonly kind: "signed-in"; readonly user: AccountUser };

/** Creates the account and emails a 6-digit code to confirm it (handoff: sign-up with code). */
export function signUp(
  email: string,
  password: string,
  firstName: string,
): Promise<Result<SignUpOutcome, AppError>> {
  return call("RR-AUTH-010", async (supabase) => {
    const { data, error } = await supabase.auth.signUp({
      email: normaliseEmail(email),
      password,
      options: { data: firstName.trim() ? { first_name: firstName.trim().slice(0, 60) } : {} },
    });
    if (error) throw error;
    return data.session
      ? ({ kind: "signed-in", user: signedIn(data.session) } as const)
      : ({ kind: "code-sent" } as const);
  });
}

/** Sends the 6-digit code to reset (or add) a password. */
export function sendResetCode(email: string): Promise<Result<void, AppError>> {
  return call("RR-AUTH-010", async (supabase) => {
    const { error } = await supabase.auth.resetPasswordForEmail(normaliseEmail(email));
    if (error) throw error;
  });
}

export function resendCode(email: string, purpose: CodePurpose): Promise<Result<void, AppError>> {
  if (purpose === "recovery") return sendResetCode(email);
  return call("RR-AUTH-010", async (supabase) => {
    const { error } = await supabase.auth.resend({ type: "signup", email: normaliseEmail(email) });
    if (error) throw error;
  });
}

/** Checks the emailed code; on success the device is signed in. */
export function verifyCode(
  email: string,
  token: string,
  purpose: CodePurpose,
): Promise<Result<AccountUser, AppError>> {
  return call("RR-AUTH-003", async (supabase) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normaliseEmail(email),
      token,
      type: purpose === "signup" ? "signup" : "recovery",
    });
    if (error) throw error;
    return signedIn(data.session);
  });
}

/** Sets the password after a recovery code (the session from verifyCode authorises it). */
export function setPassword(password: string): Promise<Result<void, AppError>> {
  return call("RR-AUTH-009", async (supabase) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  });
}

/**
 * Google. Web: OAuth with PKCE, returning to /auth/?code=… (exchanged by exchangeOAuthCode).
 * Android uses the system account chooser (Credential Manager) in Phase 3: RR-PLAT-001 here.
 */
export function signInWithGoogle(): Promise<Result<void, AppError>> {
  if (isNativePlatform()) return Promise.resolve(err(new AppError("RR-PLAT-001")));
  return call("RR-AUTH-005", async (supabase) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/` },
    });
    if (error) throw error;
  });
}

export function exchangeOAuthCode(code: string): Promise<Result<AccountUser, AppError>> {
  return call("RR-AUTH-005", async (supabase) => {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return signedIn(data.session);
  });
}

/** Signs this device out. The day stays on the phone. */
export function signOut(): Promise<Result<void, AppError>> {
  return call("RR-AUTH-004", async (supabase) => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  });
}

/**
 * Deletes the account: every Routine Raccoon row of this user and the login itself, in one
 * server transaction (RPC `delete_my_account`, TECH_SPEC §2.7). The login is shared with the
 * owner's other apps; the Account screen says so before calling this. The server only accepts
 * a session signed in within the last 10 minutes → RR-AUTH-012 (sign in again).
 */
export function deleteAccount(): Promise<Result<void, AppError>> {
  return call("RR-AUTH-007", async (supabase) => {
    const { error } = await supabase.rpc("delete_my_account");
    if (!error) return;
    throw new AppError(error.message.includes("RR-AUTH-012") ? "RR-AUTH-012" : "RR-AUTH-007", {
      cause: error,
    });
  });
}

/** The signed-in user on this device, or null. */
export function currentUser(): Promise<Result<AccountUser | null, AppError>> {
  return call("RR-AUTH-004", async (supabase) => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session ? accountUserFrom(data.session.user) : null;
  });
}
