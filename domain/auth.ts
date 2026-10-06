/**
 * Account form rules (handoff "Account", TECH_SPEC §3.1). Pure so the screen and the tests agree.
 */

/** Minimum password length (TECH_SPEC §3.1: 10, matching the project's auth settings). */
export const PASSWORD_MIN = 10;

export interface PasswordRule {
  readonly label: string;
  readonly ok: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { label: "A number or a symbol", ok: /[\d\W_]/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return passwordRules(password).every((rule) => rule.ok);
}

/** Loose, user-friendly check before asking the server (it has the final say). */
export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value.trim());
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** "sam.rivera@x.com" → "Sam": a greeting when no first name was given. */
export function firstNameFromEmail(email: string): string {
  // Everything before the first @, dot, dash, underscore, plus or digit.
  const first = email.replace(/[@._\-+0-9][\s\S]*$/, "");
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

/** "leo@routineraccoon.app" → "leo@…" (Account → Change email row). */
export function shortEmail(email: string): string {
  return email.replace(/@.*/, "@…");
}

/** The 6-digit email code, digits only (paste-friendly). */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** Seconds before "Resend code" works again (handoff: 30 s). */
export const RESEND_SECONDS = 30;
/** Wrong passwords before the copy changes and a reset code is offered (handoff: 3). */
export const MAX_PASSWORD_TRIES = 3;
/** Debounce before looking an email up (handoff: 550 ms). */
export const LOOKUP_DEBOUNCE_MS = 550;
