import { appendLog, runCommand } from "@/data/commands/run-command";
import type { CommandContext } from "@/data/commands/context";
import { defaultSmallerMinutes } from "@/domain/duration";
import { rankAfter } from "@/domain/rank";
import { EVERY_DAY } from "@/domain/recurrence";
import type { Recurrence, SurvivalLevel } from "@/domain/types";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";

/**
 * Demo routine from the design prototype, for local development and E2E only
 * (NEXT_PUBLIC_SEED_DEMO=1, never production). Synthetic data: it is NOT the user's routine.
 * Runs once, on an empty database, after ensureBaseline().
 */

const weekdays: Recurrence = {
  kind: "custom",
  days: [0, 1, 2, 3, 4],
  n: 1,
  per: "week",
  ends: "never",
};
const friToSun: Recurrence = { kind: "custom", days: [4, 5, 6], n: 1, per: "week", ends: "never" };
const every2WeeksMWF: Recurrence = {
  kind: "custom",
  days: [0, 2, 4],
  n: 2,
  per: "week",
  ends: "never",
};

interface SeedTask {
  name: string;
  emoji: string;
  minutes: number;
  smaller?: number;
  hard?: boolean;
  steps?: string[];
  mantra?: string;
  notes?: string;
  location?: string;
  recurrence?: Recurrence | null;
}

interface SeedSection {
  name: string;
  description: string;
  color: string;
  start: string;
  recurrence: Recurrence | null;
  /** Fixed section length in minutes (handoff "Length · Set it myself"). */
  override?: number;
  tasks: SeedTask[];
}

type PlanRef =
  | { kind: "primary" }
  | { kind: "custom"; name: string; description: string }
  | { kind: "survival"; level: SurvivalLevel };

const SEED: ReadonlyArray<{ plan: PlanRef; sections: SeedSection[] }> = [
  {
    plan: { kind: "primary" },
    sections: [
      {
        name: "Morning",
        description: "Out of bed and upright.",
        color: "oklch(.70 .15 65)",
        start: "07:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Drink a pint", emoji: "🚰", minutes: 2, smaller: 2, recurrence: EVERY_DAY },
          { name: "Eat something", emoji: "🍞", minutes: 20, smaller: 5, recurrence: EVERY_DAY },
          { name: "Straighten your back", emoji: "🧘", minutes: 3, smaller: 3 },
        ],
      },
      {
        name: "Smash it",
        description: "The one you keep putting off.",
        color: "#E5134A",
        start: "09:30",
        recurrence: weekdays,
        tasks: [
          {
            name: "Identify the avoided task",
            emoji: "🎯",
            minutes: 10,
            smaller: 5,
            hard: true,
            mantra: "Naming it is the whole job.",
            steps: ["Say it out loud", "Write the first line"],
          },
          {
            name: "Send the imperfect message",
            emoji: "💬",
            minutes: 5,
            hard: true,
            recurrence: weekdays,
          },
          { name: "Book the dentist", emoji: "📞", minutes: 15, smaller: 7, hard: true },
        ],
      },
      {
        name: "Evening",
        description: "",
        color: "oklch(.62 .13 300)",
        start: "18:00",
        recurrence: EVERY_DAY,
        tasks: [
          {
            name: "Prepare dinner",
            emoji: "🍲",
            minutes: 60,
            smaller: 25,
            hard: true,
            location: "Kitchen",
            recurrence: every2WeeksMWF,
            mantra: "Done is better than perfect. I can feel embarrassed and still do this.",
            notes: "Deciding is the hard part, not the cooking.",
            steps: [
              "Decide before you open the fridge",
              "Set out one pan",
              "Cook the simplest version",
            ],
          },
          { name: "Foot soak and cream", emoji: "🦶", minutes: 20, smaller: 8 },
          { name: "Tidy one surface", emoji: "🧽", minutes: 10, smaller: 5 },
        ],
      },
      {
        name: "Wind down",
        description: "Phone down, lights low.",
        color: "oklch(.66 .12 235)",
        start: "21:00",
        recurrence: friToSun,
        override: 45,
        tasks: [{ name: "Phone on the charger", emoji: "🔌", minutes: 2, smaller: 2 }],
      },
    ],
  },
  {
    plan: {
      kind: "custom",
      name: "Travelling",
      description: "Away from home. The few things that travel with you.",
    },
    sections: [
      {
        name: "Before leaving",
        description: "",
        color: "oklch(.66 .12 235)",
        start: "08:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Passport, keys, wallet", emoji: "🛂", minutes: 3 },
          { name: "Fill the water bottle", emoji: "💧", minutes: 2 },
          { name: "Pack chargers", emoji: "🎒", minutes: 5, smaller: 3 },
          { name: "Ten minute walk", emoji: "🚶", minutes: 10, smaller: 5 },
        ],
      },
    ],
  },
  {
    plan: { kind: "survival", level: 1 },
    sections: [
      {
        name: "Keep standing",
        description: "Water, food, bed. Nothing else.",
        color: "#EC406D",
        start: "09:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Drink a pint", emoji: "🚰", minutes: 2, smaller: 2 },
          { name: "Eat something", emoji: "🍞", minutes: 20, smaller: 5 },
          { name: "Phone on the charger", emoji: "🔌", minutes: 2, smaller: 2 },
        ],
      },
    ],
  },
  {
    plan: { kind: "survival", level: 2 },
    sections: [
      {
        name: "Morning",
        description: "",
        color: "oklch(.70 .15 65)",
        start: "08:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Drink a pint", emoji: "🚰", minutes: 2, smaller: 2 },
          { name: "Eat something", emoji: "🍞", minutes: 20, smaller: 5 },
          { name: "Straighten your back", emoji: "🧘", minutes: 3, smaller: 3 },
        ],
      },
      {
        name: "Evening",
        description: "",
        color: "oklch(.62 .13 300)",
        start: "18:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Foot soak and cream", emoji: "🦶", minutes: 20, smaller: 8 },
          { name: "Tidy one surface", emoji: "🧽", minutes: 10, smaller: 5 },
        ],
      },
    ],
  },
  {
    plan: { kind: "survival", level: 3 },
    sections: [
      {
        name: "Just this",
        description: "Nothing in the tank.",
        color: "#EC406D",
        start: "10:00",
        recurrence: EVERY_DAY,
        tasks: [
          { name: "Drink a pint", emoji: "🚰", minutes: 2, smaller: 2 },
          { name: "Eat anything", emoji: "🍞", minutes: 10, smaller: 5 },
        ],
      },
    ],
  },
];

export function seedDemo(
  ctx: CommandContext,
  dayKey: string,
): Promise<Result<{ seeded: boolean }, AppError>> {
  return runCommand(ctx, "seedDemo", async () => {
    if ((await ctx.db.tasks.count()) > 0) return { seeded: false };
    const at = ctx.now().toISOString();
    const synced = {
      created_at: at,
      updated_at: at,
      deleted_at: null,
      archived_at: null,
      _dirty: 1 as const,
    };
    const plans = await ctx.db.day_plans.toArray();
    let planRank =
      plans
        .map((p) => p.rank)
        .sort()
        .at(-1) ?? null;

    for (const { plan: ref, sections } of SEED) {
      let plan = plans.find((p) =>
        ref.kind === "primary"
          ? p.kind === "primary"
          : ref.kind === "survival"
            ? p.kind === "survival" && p.survival_level === ref.level
            : p.kind === "custom" && p.name === ref.name,
      );
      if (!plan && ref.kind === "custom") {
        planRank = rankAfter(planRank);
        plan = {
          id: ctx.newId(),
          name: ref.name,
          description: ref.description,
          kind: "custom",
          survival_level: null,
          rank: planRank,
          ...synced,
        };
        await ctx.db.day_plans.add(plan);
      }
      if (!plan) continue;

      let sectionRank: string | null = null;
      for (const s of sections) {
        const sectionId = ctx.newId();
        sectionRank = rankAfter(sectionRank);
        await ctx.db.sections.add({
          id: sectionId,
          name: s.name,
          description: s.description,
          color: s.color,
          start_time: s.start,
          recurrence: s.recurrence,
          notify_on_start: true,
          notify_before_close: true,
          closing_lead_minutes: 15,
          length_override_minutes: s.override ?? null,
          ...synced,
        });
        await ctx.db.plan_sections.add({
          plan_id: plan.id,
          section_id: sectionId,
          rank: sectionRank,
          ...synced,
        });

        let taskRank: string | null = null;
        for (const t of s.tasks) {
          taskRank = rankAfter(taskRank);
          await ctx.db.tasks.add({
            id: ctx.newId(),
            section_id: sectionId,
            rank: taskRank,
            name: t.name,
            emoji: t.emoji,
            minutes: t.minutes,
            hard: t.hard ?? false,
            never_shrink: false,
            survival_level: null,
            recurrence: t.recurrence ?? null,
            mantra: t.mantra ?? "",
            notes: t.notes ?? "",
            video_url: "",
            location: t.location ?? "",
            steps: (t.steps ?? []).map((text) => ({ id: ctx.newId(), text })),
            smaller_versions: { minutes: t.smaller ?? defaultSmallerMinutes(t.minutes) },
            ...synced,
          });
        }
      }
    }
    await appendLog(
      ctx,
      { kind: "imported", title: "Loaded the demo routine", meta: "Development seed" },
      { dayKey },
    );
    return { seeded: true };
  });
}
