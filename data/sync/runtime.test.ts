import { bootstrapDatabase } from "@/data/bootstrap";
import { getDb } from "@/data/db/client";
import { readKv, writeKv } from "@/data/db/kv";
import type { SessionState } from "@/data/remote/session";
import { AppError } from "@/lib/errors/app-error";
import { err, ok } from "@/lib/errors/result";
import { MemoryGateway } from "./memory-gateway";

let session: SessionState = { status: "signed-out" };
let configured = true;
const server = new MemoryGateway();

vi.mock("@/data/remote/session", () => ({ getSessionState: () => session }));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => (configured ? ok({}) : err(new AppError("RR-AUTH-008"))),
}));
vi.mock("./supabase-gateway", () => ({
  SupabaseGateway: class {
    push = server.push.bind(server);
    pull = server.pull.bind(server);
  },
}));

const user = { id: "user-a", email: "a@example.com", name: "A", provider: "email" as const };

describe("syncNow", () => {
  beforeAll(async () => {
    expect((await bootstrapDatabase({ seedDemo: true })).ok).toBe(true);
  });
  beforeEach(() => {
    vi.resetModules();
    session = { status: "signed-out" };
    configured = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does nothing when signed out, or when this phone isn't linked to the account", async () => {
    const { syncNow } = await import("./runtime");
    expect(await syncNow()).toEqual({ ok: true, value: null });
    session = { status: "signed-in", user };
    expect(await syncNow()).toEqual({ ok: true, value: null });
    expect(server.rows("tasks")).toHaveLength(0);
  });

  it("is unavailable in a build without an account", async () => {
    configured = false;
    session = { status: "signed-in", user };
    const { getSyncDeps, syncNow } = await import("./runtime");
    expect(getSyncDeps().ok).toBe(false);
    const result = await syncNow();
    expect(result.ok ? null : result.error.code).toBe("RR-AUTH-008");
  });

  it("syncs when linked, records the time, and reports failures in the status store", async () => {
    session = { status: "signed-in", user };
    await writeKv(getDb(), "sync_owner", user.id);
    const { syncNow, useSyncStatus, getSyncDeps } = await import("./runtime");
    const first = getSyncDeps();
    const second = getSyncDeps();
    expect(first.ok && second.ok && first.value === second.value).toBe(true);
    const result = await syncNow();
    expect(result.ok && (result.value?.pushed ?? 0)).toBeGreaterThan(0);
    expect(server.rows("tasks").length).toBeGreaterThan(0);
    expect(await readKv(getDb(), "last_synced_at")).not.toBeNull();
    expect(useSyncStatus.getState()).toEqual({ phase: "idle", error: null });

    server.failNext(new AppError("RR-AUTH-004"));
    await getDb().tasks.toCollection().modify({ _dirty: 1 });
    const failed = await syncNow();
    expect(failed.ok ? null : failed.error.code).toBe("RR-AUTH-004");
    expect(useSyncStatus.getState().phase).toBe("error");
  });
});
