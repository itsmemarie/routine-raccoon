import { emitLocalWrite } from "@/data/events";
import { toAppError, type AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import type { LogCopy } from "@/domain/log";
import type { CommandContext } from "./context";

/**
 * Runs a command body in ONE read-write transaction over every table (TECH_SPEC §2.5): the
 * change and its log entry commit together or not at all. Validation or not-found failures are
 * thrown as AppErrors inside the body; anything else becomes RR-DB-002 (or RR-DB-003 when the
 * phone is out of space). On success, `local-write` is emitted so sync can push, unless the
 * command only touched device-only state (`syncable: false`, e.g. the running timer).
 */
export async function runCommand<T>(
  ctx: CommandContext,
  name: string,
  body: () => Promise<T>,
  options: { readonly syncable?: boolean } = {},
): Promise<Result<T, AppError>> {
  try {
    const value = await ctx.db.transaction("rw", ctx.db.tables, body);
    if (options.syncable !== false) emitLocalWrite(name);
    return ok(value);
  } catch (error) {
    return err(toAppError(error, "RR-DB-002"));
  }
}

/** Server limits for log_entries text (check constraints); longer copy would be refused on push. */
const TITLE_MAX = 200;
const META_MAX = 300;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Appends a log entry inside the current transaction. */
export async function appendLog(
  ctx: CommandContext,
  copy: LogCopy,
  refs: { dayKey: string; taskId?: string | null; sectionId?: string | null },
): Promise<void> {
  const at = ctx.now().toISOString();
  await ctx.db.log_entries.add({
    id: ctx.newId(),
    at,
    day_key: refs.dayKey,
    kind: copy.kind,
    title: clip(copy.title, TITLE_MAX),
    meta: clip(copy.meta, META_MAX),
    task_id: refs.taskId ?? null,
    section_id: refs.sectionId ?? null,
    updated_at: at,
    _dirty: 1,
  });
}
