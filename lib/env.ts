import { z } from "zod";

/**
 * Public runtime configuration, validated once (TECH_SPEC §3.4).
 *
 * NEXT_PUBLIC_ vars must be referenced literally (`process.env.NEXT_PUBLIC_X`) so Next.js can
 * inline them into the static bundle; a dynamic lookup would be `undefined` on the device.
 * Supabase is optional: without it the app runs local-first and accounts show RR-AUTH-008.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const EnvSchema = z
  .object({
    appEnv: z.enum(["local", "staging", "production"]).default("local"),
    supabaseUrl: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$|^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/)
        .optional(),
    ),
    supabasePublishableKey: z.preprocess(
      blankToUndefined,
      z
        .string()
        .refine((key) => !key.startsWith("sb_secret_"), {
          message: "A secret key is in a public variable. Use the sb_publishable_ key.",
        })
        .optional(),
    ),
    sentryDsn: z.preprocess(blankToUndefined, z.url().optional()),
    enableFaults: z.boolean(),
    seedDemo: z.boolean(),
    version: z.string(),
  })
  .refine((env) => !(env.appEnv === "production" && env.enableFaults), {
    message: "Fault injection must be off in production.",
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse({
    appEnv: blankToUndefined(raw.NEXT_PUBLIC_APP_ENV),
    supabaseUrl: raw.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    sentryDsn: raw.NEXT_PUBLIC_SENTRY_DSN,
    enableFaults: raw.NEXT_PUBLIC_ENABLE_FAULTS === "1",
    seedDemo: raw.NEXT_PUBLIC_SEED_DEMO === "1",
    version: raw.NEXT_PUBLIC_APP_VERSION ?? "0.0.0-dev",
  });
  if (!result.success) {
    // RR-APP-006 is in the message so toAppError() maps it to the right code at the boundary.
    throw new Error(`RR-APP-006: invalid environment. ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ENABLE_FAULTS: process.env.NEXT_PUBLIC_ENABLE_FAULTS,
    NEXT_PUBLIC_SEED_DEMO: process.env.NEXT_PUBLIC_SEED_DEMO,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  });
  return cached;
}

/** Test seam: forget the parsed env so a test can stub process.env and parse again. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** True when both Supabase values are present, i.e. the optional account can be offered. */
export function isAccountConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}
