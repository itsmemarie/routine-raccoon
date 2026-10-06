import { ensureBaseline } from "@/data/commands/baseline";
import { defaultContext, type CommandContext } from "@/data/commands/context";
import { openDb } from "@/data/db/client";
import { readKv } from "@/data/db/kv";
import { seedDemo } from "@/data/db/seed-demo";
import { dayKeyFor } from "@/domain/time";
import type { AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";

/**
 * App start: open storage (RR-DB-001/004 on failure), make sure the baseline plans and
 * settings exist, and optionally load the demo routine in development.
 */
export async function bootstrapDatabase(options: {
  seedDemo: boolean;
  ctx?: CommandContext;
}): Promise<Result<void, AppError>> {
  const ctx = options.ctx ?? defaultContext();
  const opened = await openDb(ctx.db);
  if (!opened.ok) return opened;
  const baseline = await ensureBaseline(ctx);
  if (!baseline.ok) return err(baseline.error);
  if (options.seedDemo && !(await readKv(ctx.db, "pending_initial_pull"))) {
    const seeded = await seedDemo(ctx, dayKeyFor(ctx.now(), "00:00"));
    if (!seeded.ok) return err(seeded.error);
  }
  return ok(undefined);
}
