import type { CommandContext } from "@/data/commands/context";
import { RoutineDb } from "@/data/db/schema";

/**
 * A private, empty database per test (fake-indexeddb), a fixed clock you can move, and
 * predictable ids. Call `close()` in afterEach.
 */
export function testContext(
  start = new Date("2026-09-08T07:41:00.000Z"),
  options: { idPrefix?: string } = {},
) {
  // Valid UUIDs; give simulated devices different prefixes so their ids never collide.
  const prefix = options.idPrefix ?? "10000000-0000-4000-8000-";
  const db = new RoutineDb(`test-${crypto.randomUUID()}`);
  let now = start;
  let seq = 0;
  const ctx: CommandContext = {
    db,
    now: () => now,
    newId: () => `${prefix}${String(++seq).padStart(12, "0")}`,
  };
  return {
    ctx,
    db,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    async close() {
      db.close();
      await db.delete();
    },
  };
}
