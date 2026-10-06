import { isAccountConfigured, parseEnv } from "./env";

describe("parseEnv", () => {
  it("defaults to a local, local-first build", () => {
    const env = parseEnv({});
    expect(env).toMatchObject({
      appEnv: "local",
      enableFaults: false,
      seedDemo: false,
      version: "0.0.0-dev",
    });
    expect(isAccountConfigured(env)).toBe(false);
  });

  it("treats blank values as unset", () => {
    const env = parseEnv({ NEXT_PUBLIC_SUPABASE_URL: " ", NEXT_PUBLIC_SENTRY_DSN: "" });
    expect(env.supabaseUrl).toBeUndefined();
    expect(env.sentryDsn).toBeUndefined();
  });

  it("enables accounts when both Supabase values are present", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://kvccsypvuoyycfoozcew.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
    });
    expect(isAccountConfigured(env)).toBe(true);
  });

  it("accepts the local Supabase stack URL", () => {
    expect(parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).supabaseUrl).toBe(
      "http://127.0.0.1:54321",
    );
  });

  it("rejects a secret key in a public variable with RR-APP-006", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_oops" })).toThrow(
      /RR-APP-006/,
    );
  });

  it("rejects fault injection in production", () => {
    expect(() =>
      parseEnv({ NEXT_PUBLIC_APP_ENV: "production", NEXT_PUBLIC_ENABLE_FAULTS: "1" }),
    ).toThrow(/RR-APP-006/);
  });

  it("rejects an unknown environment name", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_APP_ENV: "prod" })).toThrow(/RR-APP-006/);
  });
});
