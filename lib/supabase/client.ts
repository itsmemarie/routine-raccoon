import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import { getSupabaseConfig, SUPABASE_SCHEMA } from "./config";
import type { Database } from "./database.types";

export type RaccoonSupabase = SupabaseClient<Database, typeof SUPABASE_SCHEMA>;

let client: RaccoonSupabase | undefined;

/**
 * Browser/WebView Supabase client (singleton). Static export means there is no server: the
 * session lives on the device. Phase 3 swaps `auth.storage` for a Keystore-backed adapter
 * (TECH_SPEC §3.1). Only data/sync and data/remote may call this (lint-enforced).
 */
export function getSupabaseClient(): Result<RaccoonSupabase, AppError> {
  if (client) return ok(client);
  const config = getSupabaseConfig();
  if (!config) return err(new AppError("RR-AUTH-008"));
  client = createClient<Database, typeof SUPABASE_SCHEMA>(config.url, config.publishableKey, {
    db: { schema: SUPABASE_SCHEMA },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // No OAuth redirects into a Capacitor WebView; Google uses signInWithIdToken (Phase 3).
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return ok(client);
}
