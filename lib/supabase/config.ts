// The Supabase project is shared with other apps. Everything Routine Raccoon owns lives
// in the `app_routine_raccoon` schema (internals in `app_routine_raccoon_private`, which
// is not exposed to the API). Never create app objects in `public`.
export const SUPABASE_SCHEMA = "app_routine_raccoon";

// NEXT_PUBLIC_ vars must be referenced literally so Next can inline them in the browser bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.",
  );
}
if (publishableKey.startsWith("sb_secret_")) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the sb_publishable_ key; NEXT_PUBLIC_ vars ship to the browser.",
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_PUBLISHABLE_KEY = publishableKey;
