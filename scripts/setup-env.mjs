// Interactive setup for the Supabase connection: asks for the project URL and the
// publishable key, then writes them to .env. Run with `npm run setup:env`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const ENV_FILE = ".env";
const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

function readEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const values = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function mask(key) {
  return key.length > 24 ? `${key.slice(0, 20)}…${key.slice(-4)}` : key;
}

function checkUrl(value) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(value)) {
    return "Expected something like https://abcdefgh.supabase.co";
  }
}

function checkKey(value) {
  if (value.startsWith("sb_secret_")) {
    return "That's the SECRET key. It must never go in a NEXT_PUBLIC_ variable. Use the sb_publishable_ key.";
  }
  if (!value.startsWith("sb_publishable_")) {
    return "Expected a key starting with sb_publishable_ (Dashboard → Project Settings → API Keys).";
  }
}

const rl = createInterface({ input: stdin, output: stdout });
// Iterating buffers lines, so pasted or piped input isn't dropped between prompts.
const lines = rl[Symbol.asyncIterator]();

async function ask(label, current, check, show = (v) => v) {
  const hint = current ? ` [Enter keeps ${show(current)}]` : "";
  for (;;) {
    stdout.write(`${label}${hint}: `);
    const next = await lines.next();
    if (next.done) {
      console.log("\nCancelled, .env not changed.");
      process.exit(1);
    }
    const answer = next.value.trim();
    const value = (answer || current || "").replace(/\/$/, "");
    const problem = value ? check(value) : "This value is required.";
    if (!problem) return value;
    console.log(`  ✗ ${problem}`);
  }
}

const existing = readEnv();
console.log("\nSupabase setup for Routine Raccoon (writes to .env)\n");

const url = await ask("1) Project URL", existing[URL_VAR], checkUrl);
const key = await ask("2) Publishable key", existing[KEY_VAR], checkKey, mask);
rl.close();

// Keep any other variables already in .env.
const others = Object.entries(existing)
  .filter(([name]) => name !== URL_VAR && name !== KEY_VAR)
  .map(([name, value]) => `${name}=${value}`);

writeFileSync(ENV_FILE, [`${URL_VAR}=${url}`, `${KEY_VAR}=${key}`, ...others].join("\n") + "\n");

console.log(`\n✓ Saved to ${ENV_FILE}. Restart \`npm run dev\` if it's running.\n`);
