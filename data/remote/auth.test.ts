// @vitest-environment jsdom
import { AuthApiError, type User } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { err, ok } from "@/lib/errors/result";
import {
  accountUserFrom,
  currentUser,
  deleteAccount,
  exchangeOAuthCode,
  lookupEmail,
  mapAuthError,
  resendCode,
  sendResetCode,
  setPassword,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUp,
  verifyCode,
} from "./auth";

const user = (overrides: Partial<User> = {}): User => ({
  id: "u1",
  email: "leo@example.com",
  app_metadata: { provider: "email" },
  user_metadata: { first_name: "Leo" },
  aud: "authenticated",
  created_at: "2026-09-01T00:00:00Z",
  identities: [],
  ...overrides,
});
const session = (u: User = user()) => ({
  user: u,
  access_token: "t",
  refresh_token: "r",
  expires_in: 3600,
  token_type: "bearer",
});
const authError = (code: string, status = 400, message = code) =>
  new AuthApiError(message, status, code);

const auth = {
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
};
const rpc = vi.fn();
let configured = true;
let native = false;

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => (configured ? ok({ auth, rpc }) : err(new AppError("RR-AUTH-008"))),
}));
vi.mock("@/lib/platform/platform", () => ({ isNativePlatform: () => native }));

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  rpc.mockReset();
  configured = true;
  native = false;
});

describe("mapAuthError", () => {
  it.each([
    ["invalid_credentials", "RR-AUTH-001"],
    ["over_request_rate_limit", "RR-AUTH-002"],
    ["otp_expired", "RR-AUTH-003"],
    ["session_expired", "RR-AUTH-004"],
    ["bad_oauth_state", "RR-AUTH-005"],
    ["weak_password", "RR-AUTH-009"],
    ["over_email_send_rate_limit", "RR-AUTH-010"],
  ])("%s → %s", (code, expected) => {
    expect(mapAuthError(authError(code), "RR-APP-001").code).toBe(expected);
  });

  it("treats a bare 403 about the token as a bad code, and everything else by fallback", () => {
    expect(
      mapAuthError(
        new AuthApiError("Token has expired or is invalid", 403, undefined),
        "RR-APP-001",
      ).code,
    ).toBe("RR-AUTH-003");
    expect(mapAuthError(authError("unexpected_failure", 500), "RR-AUTH-007").code).toBe(
      "RR-NET-004",
    );
    expect(mapAuthError(new TypeError("Failed to fetch"), "RR-AUTH-007").code).toBe("RR-NET-001");
  });
});

describe("accountUserFrom", () => {
  it("reads name and provider from Supabase's user", () => {
    expect(accountUserFrom(user())).toEqual({
      id: "u1",
      email: "leo@example.com",
      name: "Leo",
      provider: "email",
    });
    const google = user({
      email: undefined,
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "Ada Lovelace" },
      identities: [{ provider: "google" } as never],
    });
    expect(accountUserFrom(google)).toMatchObject({ email: "", name: "Ada", provider: "google" });
    expect(accountUserFrom(user({ user_metadata: { given_name: "Sam" } })).name).toBe("Sam");
    expect(accountUserFrom(user({ user_metadata: {} })).name).toBe("");
  });
});

describe("auth gateway", () => {
  it("returns RR-AUTH-008 when the build has no account", async () => {
    configured = false;
    const result = await signOut();
    expect(result.ok ? null : result.error.code).toBe("RR-AUTH-008");
  });

  it("lookupEmail classifies known, Google-only and new; failures are RR-AUTH-006", async () => {
    rpc.mockResolvedValueOnce({
      data: { exists: true, providers: ["email"], first_name: "Leo" },
      error: null,
    });
    expect(await lookupEmail(" Leo@Example.com ")).toEqual({
      ok: true,
      value: { status: "known", firstName: "Leo" },
    });
    expect(rpc).toHaveBeenCalledWith("lookup_account", { p_email: "leo@example.com" });
    rpc.mockResolvedValueOnce({
      data: { exists: true, providers: ["google"], first_name: null },
      error: null,
    });
    expect((await lookupEmail("a@b.co")).ok && "google").toBe("google");
    rpc.mockResolvedValueOnce({ data: { exists: false }, error: null });
    const fresh = await lookupEmail("a@b.co");
    expect(fresh.ok && fresh.value.status).toBe("new");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "PGRST202", code: "PGRST202" } });
    const missing = await lookupEmail("a@b.co");
    expect(missing.ok ? null : missing.error.code).toBe("RR-AUTH-006");
    rpc.mockResolvedValueOnce({ data: { nonsense: true }, error: null });
    const bad = await lookupEmail("a@b.co");
    expect(bad.ok ? null : bad.error.code).toBe("RR-AUTH-006");
  });

  it("password sign-in: success, unconfirmed email (sends a code), and wrong password", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: session() }, error: null });
    const ok1 = await signInWithPassword("leo@example.com", "pw");
    expect(ok1.ok && ok1.value).toEqual({ kind: "signed-in", user: accountUserFrom(user()) });

    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: authError("email_not_confirmed"),
    });
    auth.resend.mockResolvedValueOnce({ error: null });
    const unconfirmed = await signInWithPassword("leo@example.com", "pw");
    expect(unconfirmed.ok && unconfirmed.value).toEqual({ kind: "needs-code" });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "leo@example.com" });

    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: authError("email_not_confirmed"),
    });
    auth.resend.mockResolvedValueOnce({ error: authError("over_email_send_rate_limit", 429) });
    const noMail = await signInWithPassword("leo@example.com", "pw");
    expect(noMail.ok ? null : noMail.error.code).toBe("RR-AUTH-010");

    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: authError("invalid_credentials"),
    });
    const wrong = await signInWithPassword("leo@example.com", "nope");
    expect(wrong.ok ? null : wrong.error.code).toBe("RR-AUTH-001");

    auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: null });
    const noSession = await signInWithPassword("leo@example.com", "pw");
    expect(noSession.ok ? null : noSession.error.code).toBe("RR-AUTH-004");
  });

  it("sign-up sends a code, or signs in when confirmation is off; stores the first name", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await signUp("new@example.com", "tigers4ever!", " Sam ")).toEqual({
      ok: true,
      value: { kind: "code-sent" },
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "tigers4ever!",
      options: { data: { first_name: "Sam" } },
    });
    auth.signUp.mockResolvedValueOnce({ data: { session: session() }, error: null });
    const instant = await signUp("new@example.com", "tigers4ever!", "");
    expect(instant.ok && instant.value.kind).toBe("signed-in");
    auth.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: authError("weak_password", 422),
    });
    const weak = await signUp("new@example.com", "short", "");
    expect(weak.ok ? null : weak.error.code).toBe("RR-AUTH-009");
  });

  it("codes: reset, resend for both purposes, verify, set password", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.resend.mockResolvedValue({ error: null });
    expect((await sendResetCode("leo@example.com")).ok).toBe(true);
    expect((await resendCode("leo@example.com", "recovery")).ok).toBe(true);
    expect((await resendCode("leo@example.com", "signup")).ok).toBe(true);
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "leo@example.com" });
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: authError("over_email_send_rate_limit", 429),
    });
    expect((await sendResetCode("leo@example.com")).ok).toBe(false);
    auth.resend.mockResolvedValueOnce({ error: authError("over_email_send_rate_limit", 429) });
    expect((await resendCode("leo@example.com", "signup")).ok).toBe(false);

    auth.verifyOtp.mockResolvedValueOnce({ data: { session: session() }, error: null });
    const verified = await verifyCode("leo@example.com", "482913", "signup");
    expect(verified.ok && verified.value.id).toBe("u1");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "leo@example.com",
      token: "482913",
      type: "signup",
    });
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: authError("otp_expired", 403),
    });
    const expired = await verifyCode("leo@example.com", "000000", "recovery");
    expect(expired.ok ? null : expired.error.code).toBe("RR-AUTH-003");

    auth.updateUser.mockResolvedValueOnce({ error: null });
    expect((await setPassword("tigers4ever!")).ok).toBe(true);
    auth.updateUser.mockResolvedValueOnce({ error: authError("weak_password", 422) });
    expect((await setPassword("x")).ok).toBe(false);
  });

  it("Google: OAuth on the web, not yet on Android; the return code is exchanged", async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ error: null });
    expect((await signInWithGoogle()).ok).toBe(true);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/` },
    });
    auth.signInWithOAuth.mockResolvedValueOnce({ error: authError("provider_disabled") });
    expect((await signInWithGoogle()).ok).toBe(false);
    native = true;
    const android = await signInWithGoogle();
    expect(android.ok ? null : android.error.code).toBe("RR-PLAT-001");

    auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: session() },
      error: null,
    });
    expect((await exchangeOAuthCode("abc")).ok).toBe(true);
    auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null },
      error: authError("bad_code_verifier"),
    });
    const bad = await exchangeOAuthCode("abc");
    expect(bad.ok ? null : bad.error.code).toBe("RR-AUTH-005");
  });

  it("sign out, delete the account, current user", async () => {
    auth.signOut.mockResolvedValueOnce({ error: null });
    expect((await signOut()).ok).toBe(true);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    auth.signOut.mockResolvedValueOnce({ error: authError("session_not_found", 404) });
    expect((await signOut()).ok).toBe(false);

    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await deleteAccount()).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const failed = await deleteAccount();
    expect(failed.ok ? null : failed.error.code).toBe("RR-AUTH-007");
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PT403", message: "RR-AUTH-012: sign in again to delete your account" },
    });
    const stale = await deleteAccount();
    expect(stale.ok ? null : stale.error.code).toBe("RR-AUTH-012");

    auth.getSession.mockResolvedValueOnce({ data: { session: session() }, error: null });
    const current = await currentUser();
    expect(current.ok && current.value?.email).toBe("leo@example.com");
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await currentUser()).toEqual({ ok: true, value: null });
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: authError("session_expired"),
    });
    expect((await currentUser()).ok).toBe(false);
  });
});
