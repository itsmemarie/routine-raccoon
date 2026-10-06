import { readKv } from "@/data/db/kv";
import { rankAfter } from "@/domain/rank";
import { SettingsSchema } from "@/domain/schemas";
import type { DayPlan, SurvivalLevel } from "@/domain/types";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import type { CommandContext } from "./context";
import { runCommand } from "./run-command";

/** The three survival plans every install starts with (PRD §4.1, handoff seed copy). */
export const SURVIVAL_PLAN_SEED: ReadonlyArray<{
  level: SurvivalLevel;
  name: string;
  description: string;
}> = [
  {
    level: 1,
    name: "Bare minimum",
    description: "No time today. Only what keeps the day standing.",
  },
  { level: 2, name: "Bad day", description: "Not feeling it. Half the day, half the length." },
  { level: 3, name: "Zero energy", description: "Nothing in the tank. Water, food, bed." },
];

/**
 * Idempotent first-run setup: one primary plan ("Normal"), the three survival plans and the
 * settings row. Safe to call on every start; it only fills what is missing.
 */
export function ensureBaseline(
  ctx: CommandContext,
): Promise<Result<{ created: boolean }, AppError>> {
  return runCommand(ctx, "ensureBaseline", async () => {
    // Waiting for the saved copy to download: its plans and settings are the baseline.
    if (await readKv(ctx.db, "pending_initial_pull")) return { created: false };
    const at = ctx.now().toISOString();
    const synced = {
      created_at: at,
      updated_at: at,
      deleted_at: null,
      archived_at: null,
      _dirty: 1 as const,
    };
    let created = false;

    const plans = (await ctx.db.day_plans.toArray()).filter((p) => p.deleted_at === null);
    let lastRank =
      plans
        .map((p) => p.rank)
        .sort()
        .at(-1) ?? null;
    const add = async (
      plan: Omit<
        DayPlan,
        "id" | "rank" | "created_at" | "updated_at" | "deleted_at" | "archived_at"
      >,
    ) => {
      lastRank = rankAfter(lastRank);
      await ctx.db.day_plans.add({ id: ctx.newId(), rank: lastRank, ...synced, ...plan });
      created = true;
    };

    if (!plans.some((p) => p.kind === "primary")) {
      await add({
        name: "Normal",
        description: "The full day — every section, every task.",
        kind: "primary",
        survival_level: null,
      });
    }
    for (const seed of SURVIVAL_PLAN_SEED) {
      if (!plans.some((p) => p.kind === "survival" && p.survival_level === seed.level)) {
        await add({
          name: seed.name,
          description: seed.description,
          kind: "survival",
          survival_level: seed.level,
        });
      }
    }
    if (!(await ctx.db.user_settings.get("me"))) {
      await ctx.db.user_settings.add({
        key: "me",
        settings: SettingsSchema.parse({}),
        created_at: at,
        updated_at: at,
        deleted_at: null,
        _dirty: 1,
      });
      created = true;
    }
    return { created };
  });
}
