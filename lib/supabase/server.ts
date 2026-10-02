import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SCHEMA,
  SUPABASE_URL,
} from "./config";
import type { Database } from "./database.types";

// For Server Components, Server Actions and Route Handlers.
// Create a new client per request; don't share one in a module-level variable.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    db: { schema: SUPABASE_SCHEMA },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
