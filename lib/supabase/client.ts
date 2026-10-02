import { createBrowserClient } from "@supabase/ssr";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SCHEMA,
  SUPABASE_URL,
} from "./config";
import type { Database } from "./database.types";

// For Client Components.
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    db: { schema: SUPABASE_SCHEMA },
  });
}
