import type { RaccoonSupabase } from "@/lib/supabase/client";
import { SupabaseGateway } from "./supabase-gateway";

/** A minimal stand-in for the PostgREST query builder chain the gateway uses. */
function fakeClient(result: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "upsert", "select", "gt", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.abortSignal = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  return { client: builder as unknown as RaccoonSupabase, calls };
}

describe("SupabaseGateway", () => {
  it("upserts on the table's conflict target; log entries ignore duplicates", async () => {
    const { client, calls } = fakeClient({});
    const gateway = new SupabaseGateway(client);
    await gateway.push("plan_sections", [{ plan_id: "p", section_id: "s" }]);
    await gateway.push("log_entries", [{ id: "l" }]);
    await gateway.push("tasks", []);
    const upserts = calls.filter((c) => c.method === "upsert").map((c) => c.args[1]);
    expect(upserts).toEqual([
      { onConflict: "plan_id,section_id", ignoreDuplicates: false },
      { onConflict: "id", ignoreDuplicates: true },
    ]);
  });

  it("maps PostgREST errors to codes", async () => {
    const constraint = new SupabaseGateway(
      fakeClient({ error: { code: "23514", message: "check" } }).client,
    );
    await expect(constraint.push("tasks", [{ id: "t" }])).rejects.toMatchObject({
      code: "RR-SYNC-003",
    });
    const expired = new SupabaseGateway(
      fakeClient({ error: { status: 401, message: "JWT expired" } }).client,
    );
    await expect(expired.pull("tasks", 0, 10)).rejects.toMatchObject({ code: "RR-AUTH-004" });
    const other = new SupabaseGateway(fakeClient({ error: { message: "weird" } }).client);
    await expect(other.pull("tasks", 0, 10)).rejects.toMatchObject({ code: "RR-SYNC-002" });
  });

  it("pulls ascending by server_seq and drops rows without a numeric server_seq", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "a", server_seq: 4 }, { id: "b" }, null] });
    const rows = await new SupabaseGateway(client).pull("tasks", 3, 500);
    expect(rows).toEqual([{ id: "a", server_seq: 4 }]);
    expect(calls.find((c) => c.method === "gt")?.args).toEqual(["server_seq", 3]);
    expect(calls.find((c) => c.method === "limit")?.args).toEqual([500]);
  });

  it("treats a null data payload as no rows", async () => {
    await expect(
      new SupabaseGateway(fakeClient({ data: null }).client).pull("tasks", 0, 1),
    ).resolves.toEqual([]);
  });
});
