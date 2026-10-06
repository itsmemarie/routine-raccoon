"use client";

import { ChevronLeft, LockKeyhole, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ErrorCodeTag } from "@/components/errors/error-code-tag";
import { canGoBack } from "@/components/ui/navigation";
import { ScreenRoot } from "@/components/ui/screen";
import {
  exchangeOAuthCode,
  lookupEmail,
  resendCode,
  sendResetCode,
  setPassword,
  signInWithGoogle,
  signInWithPassword,
  signUp,
  verifyCode,
  type AccountUser,
  type CodePurpose,
} from "@/data/remote/auth";
import { useSession } from "@/data/remote/session";
import {
  isStrongPassword,
  isValidEmail,
  LOOKUP_DEBOUNCE_MS,
  MAX_PASSWORD_TRIES,
  normaliseEmail,
  passwordRules,
  RESEND_SECONDS,
} from "@/domain/auth";
import { AppError } from "@/lib/errors/app-error";
import { CodeInput } from "./code-input";
import { useLinkAccount } from "./use-link-account";

const PAGE = "P13" as const;

type Status = "idle" | "checking" | "known" | "google" | "new" | "unknown";
type Step = "start" | "code" | "newpass";
type Busy = null | "email" | "google" | "code" | "pass";

const fieldBox = "block rounded-[15px] border border-border bg-surface px-[15px] py-3";
const fieldLabel = "block text-[10.5px] font-semibold tracking-[0.09em] text-text-faint uppercase";
const fieldInput =
  "mt-[5px] block w-full min-w-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-text-faint";
const primary =
  "flex min-h-[52px] w-full items-center justify-center rounded-[15px] bg-primary text-[15px] font-bold text-white shadow-primary disabled:opacity-60";

function StatusPill({ status }: { status: Status }) {
  const pills: Partial<Record<Status, [string, string]>> = {
    checking: ["Checking…", "bg-canvas text-text-muted"],
    known: ["Account found", "bg-success/15 text-success"],
    google: ["Google account", "bg-section-blue/15 text-section-blue"],
    new: ["New account", "bg-amber/20 text-ink"],
  };
  const pill = pills[status];
  if (!pill) return null;
  return (
    <span
      role="status"
      className={`shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-bold tracking-[0.06em] uppercase ${pill[1]}`}
    >
      {pill[0]}
    </span>
  );
}

function ErrorBox({ error }: { error: AppError }) {
  return (
    <div role="alert" className="rounded-xl bg-tint px-[13px] py-[11px]">
      <p className="text-[12.5px] leading-[1.45] font-semibold text-primary-dark">
        {error.userMessage}
      </p>
      <ErrorCodeTag code={error.code} pageId={PAGE} />
    </div>
  );
}

/**
 * Sign in / sign up (P13, handoff screen 22): one email-first page that adapts in place.
 * `?reset=<email>` opens straight at "Reset your password" (Account → Change password).
 */
export function AuthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const ids = { email: useId(), password: useId(), name: useId() };

  const [email, setEmail] = useState(params.get("reset") ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [password, setPasswordValue] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [tries, setTries] = useState(0);
  // A Google return (?code=) or a reset link (?reset=) starts busy; a Google error starts failed.
  const [busy, setBusy] = useState<Busy>(() =>
    params.get("code") ? "google" : params.get("reset") ? "email" : null,
  );
  const [error, setError] = useState<AppError | null>(() =>
    params.get("error_description") ? new AppError("RR-AUTH-005") : null,
  );
  const [step, setStep] = useState<Step>("start");
  const [purpose, setPurpose] = useState<CodePurpose>("signup");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const goAccount = useCallback(() => router.replace("/account/"), [router]);
  const linking = useLinkAccount(PAGE, goAccount);
  const finish = useCallback(
    (user: AccountUser, event: "created" | "signed-in") => void linking.link(user, event),
    [linking],
  );

  // Resend lock countdown (handoff: 30 s).
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const startCode = useCallback((next: CodePurpose) => {
    setPurpose(next);
    setStep("code");
    setCode("");
    setError(null);
    setResendIn(RESEND_SECONDS);
  }, []);

  // Google returns to /auth/?code=… (web OAuth with PKCE); "?reset=" starts a password reset.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || session.status === "loading" || session.status === "unconfigured")
      return;
    handled.current = true;
    const oauthCode = params.get("code");
    const reset = params.get("reset");
    if (session.status === "signed-in" && !oauthCode && !reset) {
      // Opened while already signed in: the Account screen is where that lives.
      router.replace("/account/");
    } else if (oauthCode) {
      void exchangeOAuthCode(oauthCode).then((result) => {
        setBusy(null);
        if (result.ok) finish(result.value, "signed-in");
        else setError(result.error);
      });
    } else if (reset && isValidEmail(reset)) {
      void sendResetCode(reset).then((result) => {
        setBusy(null);
        if (result.ok) startCode("recovery");
        else setError(result.error);
      });
    }
  }, [params, session.status, finish, startCode, router]);

  // Debounced lookup once the email looks valid (handoff: 550 ms).
  useEffect(() => {
    if (step !== "start") return undefined;
    const address = normaliseEmail(email);
    if (!isValidEmail(address)) return undefined;
    let current = true;
    const timer = window.setTimeout(() => {
      setStatus("checking");
      void lookupEmail(address).then((result) => {
        if (!current) return;
        if (result.ok) {
          setStatus(result.value.status);
          setFirstName(result.value.firstName);
        } else {
          setStatus("unknown"); // RR-AUTH-006: carry on without the hint
        }
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [email, step]);

  if (session.status === "unconfigured") {
    return (
      <ScreenRoot pageId={PAGE} className="px-5 pt-6">
        <ErrorBox error={new AppError("RR-AUTH-008")} />
        <Link href="/settings/" className="mt-4 block text-[13px] font-semibold text-primary">
          Back to Settings
        </Link>
      </ScreenRoot>
    );
  }

  const onEmail = (value: string) => {
    setEmail(value);
    setError(null);
    setPasswordValue("");
    setTries(0);
    setStatus(isValidEmail(value) ? "checking" : "idle");
  };

  const google = async () => {
    if (busy) return;
    setError(null);
    setBusy("google");
    const result = await signInWithGoogle();
    // On success the browser leaves for Google; we only get here on failure.
    setBusy(null);
    if (!result.ok) setError(result.error);
  };

  const forgot = async () => {
    if (!isValidEmail(email)) return setError(new AppError("RR-AUTH-011"));
    setBusy("email");
    const result = await sendResetCode(email);
    setBusy(null);
    if (result.ok) startCode("recovery");
    else setError(result.error);
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!isValidEmail(email)) return setError(new AppError("RR-AUTH-011"));
    if (status === "google") return void google();
    if (status === "new") {
      if (!isStrongPassword(password)) return setError(new AppError("RR-AUTH-009"));
      setBusy("email");
      const result = await signUp(email, password, name);
      setBusy(null);
      if (!result.ok) return setError(result.error);
      if (result.value.kind === "signed-in") return finish(result.value.user, "created");
      return startCode("signup");
    }
    if (status === "checking" || status === "idle") return;
    if (!password) return setError(new AppError("RR-AUTH-001"));
    setBusy("email");
    const result = await signInWithPassword(email, password);
    setBusy(null);
    if (result.ok) {
      if (result.value.kind === "needs-code") return startCode("signup");
      return finish(result.value.user, "signed-in");
    }
    if (result.error.code === "RR-AUTH-001") {
      const next = tries + 1;
      setTries(next);
      setPasswordValue("");
      setError(new AppError(next >= MAX_PASSWORD_TRIES ? "RR-AUTH-002" : "RR-AUTH-001"));
      return;
    }
    setError(result.error);
  };

  const confirmCode = async (value: string) => {
    if (busy || value.length < 6) return;
    setBusy("code");
    const result = await verifyCode(email, value, purpose);
    setBusy(null);
    if (!result.ok) {
      setCode("");
      return setError(result.error);
    }
    if (purpose === "signup") return finish(result.value, "created");
    setPasswordValue("");
    setShow(false);
    setError(null);
    setStep("newpass");
  };

  const saveNewPassword = async () => {
    if (!isStrongPassword(password)) return setError(new AppError("RR-AUTH-009"));
    setBusy("pass");
    const result = await setPassword(password);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    const signedIn = session.status === "signed-in" ? session.user : null;
    if (signedIn) finish(signedIn, "signed-in");
    else goAccount();
  };

  const back = () => {
    if (step !== "start") {
      setStep("start");
      setError(null);
      setCode("");
      setPasswordValue("");
      return;
    }
    if (canGoBack()) router.back();
    else router.replace("/settings/");
  };

  const title =
    status === "known" || status === "google"
      ? `Welcome back${firstName ? `, ${firstName}` : ""}`
      : status === "new"
        ? "New here. Welcome."
        : "Sign in or sign up";
  const subtitle =
    status === "known"
      ? "Enter your password and your Day Plans, tasks and log come back as you left them."
      : status === "google"
        ? "This email is linked to a Google account."
        : status === "new"
          ? "No account uses this email yet. Choose a password and we'll email a code to check it's yours."
          : "One page for both. Enter your email and Routine Raccoon checks whether you already have an account.";
  const needsPassword = status === "known" || status === "unknown";
  const passwordField = (label: string, placeholder: string, autoComplete: string) => (
    <label htmlFor={ids.password} className={fieldBox}>
      <span className={fieldLabel}>{label}</span>
      <span className="flex items-center gap-2.5">
        <input
          id={ids.password}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={password}
          placeholder={placeholder}
          onChange={(event) => {
            setPasswordValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void (step === "newpass" ? saveNewPassword() : submit());
          }}
          className={fieldInput}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="min-h-11 shrink-0 px-1 text-[11.5px] font-bold text-primary"
        >
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
  const rules = (
    <ul className="flex flex-col gap-[7px] px-1 py-0.5">
      {passwordRules(password).map((rule) => (
        <li key={rule.label} className="flex items-center gap-[9px]">
          <span
            aria-hidden
            className={`flex size-[17px] shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${rule.ok ? "bg-success text-white" : "border-[1.5px] border-grip text-transparent"}`}
          >
            ✓
          </span>
          <span
            className={`text-[12px] ${rule.ok ? "font-semibold text-ink" : "font-medium text-text-faint"}`}
          >
            {rule.label}
            <span className="sr-only">{rule.ok ? " (done)" : " (not yet)"}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <ScreenRoot pageId={PAGE} className="pb-8">
      <div className="px-4 pt-[max(10px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={back}
          className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-[13px] font-semibold text-text-muted"
        >
          <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />{" "}
          {step === "start" ? "Settings" : "Back"}
        </button>
      </div>
      <div className="px-5 pt-1">
        {step === "start" ? (
          <>
            <Image
              src="/icons/routine-raccoon-logo.png"
              alt="Routine Raccoon"
              width={58}
              height={58}
              className="rounded-card shadow-primary"
              priority
            />
            <h1 className="mt-[18px] font-display text-[30px] leading-[1.08] font-bold tracking-[-0.035em] text-pretty text-ink">
              {title}
            </h1>
            <p className="mt-[9px] text-[13.5px] leading-[1.6] text-pretty text-text-muted">
              {subtitle}
            </p>

            <button
              type="button"
              onClick={() => void google()}
              disabled={busy !== null}
              className="mt-[22px] flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[15px] border border-border-strong bg-surface text-[14px] font-bold text-ink disabled:opacity-60"
            >
              <span aria-hidden className="font-display text-[17px] font-bold text-section-blue">
                G
              </span>
              {busy === "google" ? "Connecting to Google…" : "Continue with Google"}
            </button>
            <div className="my-[18px] flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-toggle-off" />
              <span className="text-[11px] font-semibold tracking-[0.1em] text-text-faint uppercase">
                or with email
              </span>
              <span className="h-px flex-1 bg-toggle-off" />
            </div>

            <form
              className="flex flex-col gap-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label htmlFor={ids.email} className={fieldBox}>
                <span className="flex min-h-[18px] items-center gap-2">
                  <span className={`${fieldLabel} flex-1`}>Email</span>
                  <StatusPill status={status} />
                </span>
                <input
                  id={ids.email}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  placeholder="you@email.com"
                  onChange={(event) => onEmail(event.target.value)}
                  className={fieldInput}
                />
              </label>

              {needsPassword ? (
                <>
                  {passwordField("Password", "Your password", "current-password")}
                  <div className="flex justify-end px-1">
                    <button
                      type="button"
                      onClick={() => void forgot()}
                      className="min-h-11 text-[12px] font-bold text-primary"
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              ) : null}

              {status === "google" ? (
                <div className="rounded-card border border-border bg-surface px-[15px] py-3.5">
                  <p className="text-[14px] font-bold text-ink">This email signs in with Google</p>
                  <p className="mt-1 text-[12.5px] leading-[1.55] text-text-muted">
                    You made the account with Google, so there&apos;s no password to type. Continue
                    with Google, or get a code to add a password too.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button type="button" onClick={() => void google()} className={primary}>
                      Continue with Google
                    </button>
                    <button
                      type="button"
                      onClick={() => void forgot()}
                      className="min-h-11 rounded-chip bg-canvas text-[13px] font-bold text-ink"
                    >
                      Email me a code to add a password
                    </button>
                  </div>
                </div>
              ) : null}

              {status === "new" ? (
                <>
                  <label htmlFor={ids.name} className={fieldBox}>
                    <span className={fieldLabel}>
                      First name <span className="tracking-normal normal-case">· optional</span>
                    </span>
                    <input
                      id={ids.name}
                      autoComplete="given-name"
                      maxLength={60}
                      value={name}
                      placeholder="So Today can greet you"
                      onChange={(event) => setName(event.target.value)}
                      className={fieldInput}
                    />
                  </label>
                  {passwordField("Create a password", "10 characters or more", "new-password")}
                  {rules}
                </>
              ) : null}

              {error ? <ErrorBox error={error} /> : null}

              {status !== "google" ? (
                <button
                  type="submit"
                  disabled={busy !== null || status === "checking"}
                  className={`${primary} mt-1`}
                >
                  {busy === "email"
                    ? status === "new"
                      ? "Sending code…"
                      : "Signing in…"
                    : status === "new"
                      ? "Create account"
                      : needsPassword
                        ? "Sign in"
                        : "Continue"}
                </button>
              ) : null}
              {needsPassword && tries >= MAX_PASSWORD_TRIES ? (
                <button
                  type="button"
                  onClick={() => void forgot()}
                  className="min-h-12 rounded-chip bg-canvas text-[14px] font-bold text-ink"
                >
                  Email me a reset code
                </button>
              ) : null}
              {status === "unknown" && error?.code === "RR-AUTH-001" ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatus("new");
                    setError(null);
                  }}
                  className="min-h-11 text-[12.5px] font-bold text-primary"
                >
                  New here? Create an account
                </button>
              ) : null}
            </form>
            <p className="mt-[18px] text-center text-[11.5px] leading-[1.6] text-text-faint">
              {status === "new"
                ? "Creating an account saves a copy of your day. It stays private."
                : "An account only stores your day. Nothing is shared with anyone."}{" "}
              <Link href="/privacy/" className="font-semibold text-primary">
                Privacy
              </Link>
            </p>
          </>
        ) : null}

        {step === "code" ? (
          <>
            <span className="flex size-[58px] items-center justify-center rounded-[18px] bg-tint text-primary">
              <Mail size={28} strokeWidth={1.9} aria-hidden />
            </span>
            <h1 className="mt-[18px] font-display text-[30px] leading-[1.08] font-bold tracking-[-0.035em] text-ink">
              {purpose === "recovery" ? "Reset your password" : "Check your inbox"}
            </h1>
            <p className="mt-[9px] text-[13.5px] leading-[1.6] text-text-muted">
              We sent a 6-digit code to{" "}
              <strong className="font-bold text-ink">{normaliseEmail(email)}</strong>.{" "}
              {purpose === "recovery"
                ? "Enter it to choose a new password."
                : "Enter it to finish creating your account."}
            </p>
            <CodeInput
              value={code}
              invalid={error !== null}
              disabled={busy === "code"}
              onChange={(next) => {
                setCode(next);
                setError(null);
                if (next.length === 6) void confirmCode(next);
              }}
            />
            <div className="mt-3.5 flex flex-col gap-2.5">
              {error ? <ErrorBox error={error} /> : null}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void confirmCode(code)}
                className={primary}
              >
                {busy === "code"
                  ? "Checking…"
                  : purpose === "recovery"
                    ? "Continue"
                    : "Confirm and create account"}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between px-1">
              <button
                type="button"
                disabled={resendIn > 0}
                onClick={() =>
                  void resendCode(email, purpose).then((result) => {
                    if (result.ok) setResendIn(RESEND_SECONDS);
                    else setError(result.error);
                  })
                }
                className="min-h-11 text-[12.5px] font-bold text-primary disabled:text-text-faint"
              >
                {resendIn > 0
                  ? `Resend code in 0:${String(resendIn).padStart(2, "0")}`
                  : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("start");
                  setEmail("");
                  setStatus("idle");
                  setError(null);
                }}
                className="min-h-11 text-[12.5px] font-bold text-text-muted"
              >
                Use a different email
              </button>
            </div>
            <p className="mt-[22px] rounded-[14px] border border-border bg-surface px-3.5 py-3 text-[12px] leading-[1.55] text-text-muted">
              The code works for 10 minutes. Not there? Check spam, or resend once the timer runs
              out.
            </p>
          </>
        ) : null}

        {step === "newpass" ? (
          <>
            <span className="flex size-[58px] items-center justify-center rounded-[18px] bg-tint text-primary">
              <LockKeyhole size={26} strokeWidth={1.9} aria-hidden />
            </span>
            <h1 className="mt-[18px] font-display text-[30px] leading-[1.08] font-bold tracking-[-0.035em] text-ink">
              Set a new password
            </h1>
            <p className="mt-[9px] text-[13.5px] leading-[1.6] text-text-muted">
              For <strong className="font-bold text-ink">{normaliseEmail(email)}</strong>. You stay
              signed in on this phone afterwards.
            </p>
            <div className="mt-[22px] flex flex-col gap-2.5">
              {passwordField("New password", "10 characters or more", "new-password")}
              {rules}
              {error ? <ErrorBox error={error} /> : null}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveNewPassword()}
                className={`${primary} mt-1`}
              >
                {busy === "pass" ? "Saving…" : "Save and sign in"}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {linking.sheet}
    </ScreenRoot>
  );
}
