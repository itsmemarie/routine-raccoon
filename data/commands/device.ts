import { writeKv, type KvValue } from "@/data/db/kv";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { runCommand } from "./run-command";

/** Device-only flags the UI may set directly (never synced, never logged). */
export type UiFlagKey = "welcome_dismissed";

export function writeKvCommand<K extends UiFlagKey>(
  ctx: CommandContext,
  input: { key: K; value: KvValue<K> },
): Promise<Result<void, AppError>> {
  return runCommand(ctx, "writeKv", () => writeKv(ctx.db, input.key, input.value), {
    syncable: false,
  });
}
