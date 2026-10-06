/**
 * The error-code registry: the ONLY place error codes are defined (TECH_SPEC §1.5).
 *
 * Format: `RR-<AREA>-<NNN>`. Codes are permanent: never renumber or reuse one. To retire a
 * code, set `retired: true` and leave it here. After editing, run `npm run errors:doc`.
 *
 * `userMessage` is product copy shown on screen next to the code. It may contain `{param}`
 * placeholders filled by `messageFor()`. `devHint` is for engineers and is never shown to users.
 */

export type ErrorArea =
  | "APP"
  | "DB"
  | "NET"
  | "SYNC"
  | "AUTH"
  | "VAL"
  | "IMP"
  | "MED"
  | "TMR"
  | "NTF"
  | "PLAT"
  | "EXP"
  | "AST";

/** fatal: the screen cannot continue · error: an action failed · warning: degraded but usable · info: guidance */
export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

export interface ErrorDefinition {
  readonly area: ErrorArea;
  readonly title: string;
  readonly userMessage: string;
  readonly severity: ErrorSeverity;
  /** True when trying the same thing again can succeed (drives withRetry and the Try again button). */
  readonly retryable: boolean;
  readonly devHint: string;
  readonly retired?: boolean;
}

export const ERROR_CODES = {
  // ── APP: unexpected or rendering failures ───────────────────────────────────────────
  "RR-APP-001": {
    area: "APP",
    title: "This screen hit a problem",
    userMessage: "Something on this screen broke. Your routine is safe on this phone.",
    severity: "fatal",
    retryable: true,
    devHint: "Uncaught render error caught by a route error.tsx or SectionBoundary.",
  },
  "RR-APP-002": {
    area: "APP",
    title: "Something went wrong in the background",
    userMessage: "A background job failed. If it keeps happening, copy the details from Help.",
    severity: "error",
    retryable: false,
    devHint:
      "window.onerror or unhandledrejection. Find the call site and give it a specific code.",
  },
  "RR-APP-003": {
    area: "APP",
    title: "Page not found",
    userMessage: "That page doesn't exist in Routine Raccoon.",
    severity: "error",
    retryable: false,
    devHint: "Rendered by app/not-found.tsx.",
  },
  "RR-APP-004": {
    area: "APP",
    title: "This link is missing something",
    userMessage: "The link didn't say which item to open.",
    severity: "error",
    retryable: false,
    devHint: "A required query param (id, section, plan, task) was missing or malformed.",
  },
  "RR-APP-005": {
    area: "APP",
    title: "A newer version is ready",
    userMessage: "Part of the app was updated. Reload to continue.",
    severity: "error",
    retryable: true,
    devHint: "ChunkLoadError: the installed bundle and a lazily loaded chunk disagree.",
  },
  "RR-APP-006": {
    area: "APP",
    title: "The app is misconfigured",
    userMessage: "This build has a configuration problem.",
    severity: "fatal",
    retryable: false,
    devHint: "lib/env.ts rejected a NEXT_PUBLIC_ value (e.g. a secret key in a public variable).",
  },

  // ── DB: on-device storage (Dexie / IndexedDB) ────────────────────────────────────────
  "RR-DB-001": {
    area: "DB",
    title: "Can't open your data on this phone",
    userMessage: "The app couldn't open its storage. Close other tabs of the app or restart it.",
    severity: "fatal",
    retryable: true,
    devHint: "Dexie open() failed: IndexedDB unavailable, blocked by another tab, or private mode.",
  },
  "RR-DB-002": {
    area: "DB",
    title: "Couldn't save that change",
    userMessage: "That change wasn't saved. Try again.",
    severity: "error",
    retryable: true,
    devHint: "A command transaction aborted. The cause is attached to the AppError.",
  },
  "RR-DB-003": {
    area: "DB",
    title: "Phone storage is full",
    userMessage: "Free up some space on your phone, then try again.",
    severity: "error",
    retryable: true,
    devHint: "QuotaExceededError from IndexedDB.",
  },
  "RR-DB-004": {
    area: "DB",
    title: "Couldn't upgrade your data",
    userMessage: "The app couldn't update how your data is stored. Nothing was deleted.",
    severity: "fatal",
    retryable: false,
    devHint: "Dexie version upgrade() threw. Check the migration in data/db/schema.ts.",
  },
  "RR-DB-005": {
    area: "DB",
    title: "That item no longer exists",
    userMessage: "It may have been deleted or archived.",
    severity: "error",
    retryable: false,
    devHint: "Lookup by id returned nothing or a tombstoned row.",
  },
  "RR-DB-006": {
    area: "DB",
    title: "Some saved data was unreadable",
    userMessage: "One item couldn't be read and was skipped.",
    severity: "warning",
    retryable: false,
    devHint: "A JSON column failed Zod validation on read. The row is skipped, not deleted.",
  },

  // ── NET: transport ───────────────────────────────────────────────────────────────────
  "RR-NET-001": {
    area: "NET",
    title: "You're offline",
    userMessage: "No connection. Your day still works; we'll back it up when you're online.",
    severity: "warning",
    retryable: true,
    devHint: "fetch() rejected with TypeError or navigator.onLine is false.",
  },
  "RR-NET-002": {
    area: "NET",
    title: "The server took too long",
    userMessage: "The server didn't answer in time. We'll try again.",
    severity: "warning",
    retryable: true,
    devHint: "withTimeout() elapsed or HTTP 408/504.",
  },
  "RR-NET-003": {
    area: "NET",
    title: "Slowing down",
    userMessage: "Too many requests at once. We'll try again shortly.",
    severity: "warning",
    retryable: true,
    devHint: "HTTP 429 from Supabase or an Edge Function rate limit.",
  },
  "RR-NET-004": {
    area: "NET",
    title: "The server had a problem",
    userMessage: "Something went wrong on the server. We'll try again.",
    severity: "warning",
    retryable: true,
    devHint: "HTTP 5xx.",
  },

  // ── SYNC: backup to the optional account ─────────────────────────────────────────────
  "RR-SYNC-001": {
    area: "SYNC",
    title: "Couldn't back up your latest changes",
    userMessage: "Your changes are safe on this phone and will be backed up later.",
    severity: "warning",
    retryable: true,
    devHint: "Push phase failed after retries. Rows stay _dirty=1.",
  },
  "RR-SYNC-002": {
    area: "SYNC",
    title: "Couldn't fetch your saved copy",
    userMessage: "We'll try again soon.",
    severity: "warning",
    retryable: true,
    devHint: "Pull phase failed after retries. Cursor unchanged.",
  },
  "RR-SYNC-003": {
    area: "SYNC",
    title: "The server refused a change",
    userMessage: "One change couldn't be backed up. It's still on this phone.",
    severity: "error",
    retryable: false,
    devHint: "Constraint violation (23xxx/22xxx). Row quarantined; see Account screen.",
  },
  "RR-SYNC-004": {
    area: "SYNC",
    title: "Couldn't combine the two copies",
    userMessage: "Nothing was lost. Try again, or choose a different option.",
    severity: "error",
    retryable: true,
    devHint: "mergeCopies() failed; local transaction rolled back.",
  },

  // ── AUTH: optional account ───────────────────────────────────────────────────────────
  "RR-AUTH-001": {
    area: "AUTH",
    title: "Wrong email or password",
    userMessage: "That password doesn't match this account.",
    severity: "info",
    retryable: false,
    devHint: "Supabase invalid_credentials.",
  },
  "RR-AUTH-002": {
    area: "AUTH",
    title: "Too many tries",
    userMessage: "Let's send you a code to reset your password instead.",
    severity: "info",
    retryable: false,
    devHint: "Three failed password attempts in this session, or Supabase over_request_rate_limit.",
  },
  "RR-AUTH-003": {
    area: "AUTH",
    title: "That code didn't work",
    userMessage: "The code is wrong or has expired. Ask for a new one.",
    severity: "info",
    retryable: false,
    devHint: "Supabase otp_expired / invalid OTP.",
  },
  "RR-AUTH-004": {
    area: "AUTH",
    title: "Please sign in again",
    userMessage: "Your session ended. Sign in to keep backing up.",
    severity: "warning",
    retryable: false,
    devHint: "401 / JWT expired / RLS 42501 for the current user.",
  },
  "RR-AUTH-005": {
    area: "AUTH",
    title: "Google sign-in didn't finish",
    userMessage: "Google sign-in was cancelled or failed. Try again.",
    severity: "info",
    retryable: true,
    devHint: "Credential Manager cancelled or signInWithIdToken rejected the token/nonce.",
  },
  "RR-AUTH-006": {
    area: "AUTH",
    title: "Couldn't check that email",
    userMessage: "We couldn't check the email right now. You can still continue.",
    severity: "warning",
    retryable: true,
    devHint: "auth-lookup Edge Function unavailable or rate limited.",
  },
  "RR-AUTH-007": {
    area: "AUTH",
    title: "Couldn't delete the account",
    userMessage: "Nothing was deleted. Try again.",
    severity: "error",
    retryable: true,
    devHint: "account-delete Edge Function failed.",
  },
  "RR-AUTH-008": {
    area: "AUTH",
    title: "Accounts aren't set up in this build",
    userMessage:
      "Your day works fully on this phone. Account backup isn't available in this build.",
    severity: "info",
    retryable: false,
    devHint: "NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set.",
  },
  "RR-AUTH-009": {
    area: "AUTH",
    title: "Password too weak",
    userMessage: "Use at least 10 characters with a number or a symbol.",
    severity: "info",
    retryable: false,
    devHint: "Supabase weak_password, or the client rules in domain/auth.ts.",
  },
  "RR-AUTH-010": {
    area: "AUTH",
    title: "Couldn't send the code",
    userMessage: "The email didn't go out. Wait a minute, then try again.",
    severity: "warning",
    retryable: true,
    devHint:
      "over_email_send_rate_limit or SMTP failure on signUp / resend / resetPasswordForEmail.",
  },
  "RR-AUTH-011": {
    area: "AUTH",
    title: "Check the email address",
    userMessage: "That email doesn't look right. Check it and try again.",
    severity: "info",
    retryable: false,
    devHint: "domain/auth.ts isValidEmail rejected the input before calling the server.",
  },

  // ── VAL: input validation (shown inline with the code) ───────────────────────────────
  "RR-VAL-001": {
    area: "VAL",
    title: "Name needed",
    userMessage: "Give it a name first.",
    severity: "info",
    retryable: false,
    devHint: "Empty or whitespace-only name (tasks, sections, plans).",
  },
  "RR-VAL-002": {
    area: "VAL",
    title: "Time out of range",
    userMessage: "Pick between 1 and 600 minutes.",
    severity: "info",
    retryable: false,
    devHint: "tasks.minutes check constraint is 1–600.",
  },
  "RR-VAL-003": {
    area: "VAL",
    title: "Video link not supported",
    userMessage: "Only YouTube and TikTok links can play inside the app.",
    severity: "info",
    retryable: false,
    devHint: "domain/video.ts allowlist rejected the URL.",
  },
  "RR-VAL-004": {
    area: "VAL",
    title: "Time looks wrong",
    userMessage: "That time doesn't look right.",
    severity: "info",
    retryable: false,
    devHint: "Not HH:MM 24h.",
  },
  "RR-VAL-005": {
    area: "VAL",
    title: "Primary plan is protected",
    userMessage: "Make another Day Plan primary first.",
    severity: "info",
    retryable: false,
    devHint: "Primary plan cannot be deleted, archived or marked survival.",
  },
  "RR-VAL-006": {
    area: "VAL",
    title: "Plan has no sections",
    userMessage: "{plan} has no sections yet.",
    severity: "info",
    retryable: false,
    devHint: "Copy to a plan without sections.",
  },
  "RR-VAL-007": {
    area: "VAL",
    title: "A section needs a Day Plan",
    userMessage: "This is the section's only Day Plan. Archive or delete the section instead.",
    severity: "info",
    retryable: false,
    devHint: "removeSectionFromPlan / createSection with no live plan left.",
  },
  "RR-VAL-008": {
    area: "VAL",
    title: "Can't be the primary Day Plan",
    userMessage: "Only a regular Day Plan can be primary. Take it out of Survival Mode first.",
    severity: "info",
    retryable: false,
    devHint: "makePrimary on a survival or archived plan.",
  },
  "RR-VAL-009": {
    area: "VAL",
    title: "All levels are taken",
    userMessage: "{name} already has three levels. Remove one first.",
    severity: "info",
    retryable: false,
    devHint: "setSurvivalMembership(on) when levels 1–3 each have a live plan.",
  },
  "RR-VAL-010": {
    area: "VAL",
    title: "Pick a section",
    userMessage: "Choose a section for it first, or add a new one.",
    severity: "info",
    retryable: false,
    devHint: "Task form / paste import saved with no section selected (plan has none yet).",
  },

  // ── IMP: paste a list ────────────────────────────────────────────────────────────────
  "RR-IMP-001": {
    area: "IMP",
    title: "Nothing to add",
    userMessage: "That paste didn't contain any tasks.",
    severity: "info",
    retryable: false,
    devHint: "All lines were blank after parsing.",
  },
  "RR-IMP-002": {
    area: "IMP",
    title: "Paste too long",
    userMessage: "Paste up to 200 lines at a time.",
    severity: "info",
    retryable: false,
    devHint: "domain/paste-parser.ts MAX_PASTE_LINES.",
  },

  // ── Device features ──────────────────────────────────────────────────────────────────
  "RR-MED-001": {
    area: "MED",
    title: "The video couldn't load",
    userMessage: "Check your connection. The rest of the task still works.",
    severity: "warning",
    retryable: true,
    devHint: "Embed iframe failed or offline.",
  },
  "RR-TMR-001": {
    area: "TMR",
    title: "Timer alert couldn't be set",
    userMessage: "The timer is running, but we couldn't set the alert for when it ends.",
    severity: "warning",
    retryable: true,
    devHint: "LocalNotifications.schedule rejected (exact alarm permission?).",
  },
  "RR-NTF-001": {
    area: "NTF",
    title: "Notifications are off",
    userMessage: "Turn on notifications in your phone's settings to get section reminders.",
    severity: "info",
    retryable: false,
    devHint: "Permission denied.",
  },
  "RR-NTF-002": {
    area: "NTF",
    title: "Couldn't schedule reminders",
    userMessage: "Section reminders weren't scheduled. We'll try again next time you open the app.",
    severity: "warning",
    retryable: true,
    devHint: "Batch schedule failed.",
  },
  "RR-PLAT-001": {
    area: "PLAT",
    title: "Not available here",
    userMessage: "This needs the Android app.",
    severity: "info",
    retryable: false,
    devHint: "Native-only capability called in the web build.",
  },
  "RR-EXP-001": {
    area: "EXP",
    title: "Export didn't finish",
    userMessage: "Nothing was exported. Try again.",
    severity: "error",
    retryable: true,
    devHint: "Serialising or writing the export file failed.",
  },
  "RR-AST-001": {
    area: "AST",
    title: "Drafting limit reached",
    userMessage: "That's today's drafting limit. You can still write it yourself.",
    severity: "info",
    retryable: false,
    devHint: "consume_assist_quota() returned false. Phase 3.",
  },
  "RR-AST-002": {
    area: "AST",
    title: "Drafting is unavailable",
    userMessage: "Claude couldn't draft this right now. You can still write it yourself.",
    severity: "warning",
    retryable: true,
    devHint: "assist-smaller-version Edge Function failed. Phase 3.",
  },
} as const satisfies Record<string, ErrorDefinition>;

/** Every valid code, as a string-literal union: an unknown code is a compile error. */
export type ErrorCode = keyof typeof ERROR_CODES;

export const ALL_ERROR_CODES = Object.keys(ERROR_CODES) as ErrorCode[];

const CODE_PATTERN = /^RR-[A-Z]+-\d{3}$/;

/** Narrows an arbitrary string to a registered code (e.g. `?__fault=` input). */
export function isErrorCode(value: string): value is ErrorCode {
  return CODE_PATTERN.test(value) && Object.hasOwn(ERROR_CODES, value);
}

export function definitionOf(code: ErrorCode): ErrorDefinition {
  return ERROR_CODES[code];
}

/** Fills `{param}` placeholders in a code's user message. Unknown placeholders are left as-is. */
export function messageFor(code: ErrorCode, params: Readonly<Record<string, string>> = {}): string {
  return ERROR_CODES[code].userMessage.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? (params[key] ?? match) : match,
  );
}
