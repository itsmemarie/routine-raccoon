import { resetEnvCache } from "@/lib/env";
import { getSupabaseClient } from "./client";
import { getSupabaseConfig } from "./config";

describe("Supabase config (optional account)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("returns RR-AUTH-008 instead of throwing when the build has no account", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    resetEnvCache();
    expect(getSupabaseConfig()).toBeNull();
    const client = getSupabaseClient();
    expect(client.ok ? null : client.error.code).toBe("RR-AUTH-008");
  });

  it("creates one client for the app schema when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://kvccsypvuoyycfoozcew.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    resetEnvCache();
    expect(getSupabaseConfig()).toEqual({
      url: "https://kvccsypvuoyycfoozcew.supabase.co",
      publishableKey: "sb_publishable_test",
    });
    const first = getSupabaseClient();
    const second = getSupabaseClient();
    expect(first.ok && second.ok && first.value === second.value).toBe(true);
  });
});
