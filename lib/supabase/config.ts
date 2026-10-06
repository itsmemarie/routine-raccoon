import { getEnv, isAccountConfigured } from "@/lib/env";

// The Supabase project is shared with other apps. Everything Routine Raccoon owns lives
// in the `app_routine_raccoon` schema (internals in `app_routine_raccoon_private`, which
// is not exposed to the API). Never create app objects in `public`.
export const SUPABASE_SCHEMA = "app_routine_raccoon";

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

/**
 * Returns the connection settings, or `null` when the build has no account configured.
 * Unlike the original scaffold this never throws: the app is local-first, so a missing
 * Supabase config disables accounts (RR-AUTH-008) instead of crashing the day.
 * A secret key in a public variable is still rejected by lib/env.ts (RR-APP-006).
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const env = getEnv();
  if (!isAccountConfigured(env) || !env.supabaseUrl || !env.supabasePublishableKey) return null;
  return { url: env.supabaseUrl, publishableKey: env.supabasePublishableKey };
}
