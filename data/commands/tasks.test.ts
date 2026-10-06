import { bootstrapDatabase } from "@/data/bootstrap";
import { compareRank } from "@/domain/rank";
import { parsePastedList, type PastedTaskDraft } from "@/domain/paste-parser";
import { testContext } from "@/tests/db";
import {
  copyTaskToPlan,
  createTask,
  deleteTask,
  duplicateTask,
  importPastedList,
  moveTask,
  patchTask,
  updateTask,
} from "./tasks";
import type { TaskDraft } from "./validate";

describe("task commands", () => {
  let t: ReturnType<typeof testContext>;
  beforeEach(async () => {
    t = testContext();
    expect((await bootstrapDatabase({ seedDemo: true, ctx: t.ctx })).ok).toBe(true);
  });
  afterEach(async () => {
    await t.close();
  });

  async function sectionByName(name: string, planName = "Normal") {
    const plans = await t.db.day_plans.toArray();
    const plan = plans.find((p) => p.name === planName);
    const links = await t.db.plan_sections
      .where("plan_id")
      .equals(plan?.id ?? "")
      .toArray();
    const sections = await t.db.sections.bulkGet(links.map((l) => l.section_id));
    const found = sections.find((s) => s?.name === name);
    if (!found) throw new Error(`no section ${name}`);
    return found;
  }

  async function taskByName(name: string) {
    const found = (await t.db.tasks.toArray()).find((x) => x.name === name && !x.deleted_at);
    if (!found) throw new Error(`no task ${name}`);
    return found;
  }

  async function orderedNames(sectionId: string) {
    return (await t.db.tasks.where("section_id").equals(sectionId).toArray())
      .filter((x) => x.deleted_at === null)
      .sort(compareRank)
      .map((x) => x.name);
  }

  function draft(sectionId: string, overrides: Partial<TaskDraft> = {}): TaskDraft {
    return {
      name: "Take vitamins",
      emoji: "",
      minutes: 5,
      hard: false,
      sectionId,
      steps: [{ text: " Open the box " }, { text: "   " }, { text: "Swallow" }],
      mantra: "",
      notes: "",
      videoUrl: "",
      location: "",
      recurrence: null,
      neverShrink: false,
      smaller: { minutes: null, text: "" },
      ...overrides,
    };
  }

  describe("createTask", () => {
    it("adds the task at the end of the section, cleans input and logs `added`", async () => {
      const morning = await sectionByName("Morning");
      const result = await createTask(t.ctx, { draft: draft(morning.id), copyToLevels: [] });
      expect(result.ok).toBe(true);
      const task = await taskByName("Take vitamins");
      expect(task).toMatchObject({ emoji: "💊", section_id: morning.id, _dirty: 1 });
      expect(task.steps.map((s) => s.text)).toEqual(["Open the box", "Swallow"]);
      expect((await orderedNames(morning.id)).at(-1)).toBe("Take vitamins");
      const log = await t.db.log_entries.where("kind").equals("added").toArray();
      expect(log.map((l) => [l.title, l.meta])).toContainEqual([
        "Added Take vitamins",
        "Morning · 5 min",
      ]);
    });

    it("copies into the picked survival plans: same-named section, first section, or a new one", async () => {
      const morning = await sectionByName("Morning");
      const result = await createTask(t.ctx, {
        draft: draft(morning.id, { name: "Stretch" }),
        copyToLevels: [1, 2, 2],
      });
      expect(result.ok && result.value.copiedTo).toEqual(["Bare minimum", "Bad day"]);
      const copies = (await t.db.tasks.toArray()).filter((x) => x.name === "Stretch");
      expect(copies).toHaveLength(3);
      // Bad day has a "Morning" section → same name. Bare minimum doesn't → its first section.
      expect(copies.find((c) => c.survival_level === 2)?.section_id).toBe(
        (await sectionByName("Morning", "Bad day")).id,
      );
      expect(copies.find((c) => c.survival_level === 1)?.section_id).toBe(
        (await sectionByName("Keep standing", "Bare minimum")).id,
      );
    });

    it("creates a section named after the source when the survival plan has none", async () => {
      const zero = (await t.db.day_plans.toArray()).find((p) => p.name === "Zero energy");
      const links = await t.db.plan_sections
        .where("plan_id")
        .equals(zero?.id ?? "")
        .toArray();
      for (const link of links) {
        await t.db.plan_sections.update([link.plan_id, link.section_id], {
          deleted_at: "2026-09-01T00:00:00Z",
        });
      }
      const morning = await sectionByName("Morning");
      await createTask(t.ctx, {
        draft: draft(morning.id, { name: "Sip water" }),
        copyToLevels: [3],
      });
      const created = await sectionByName("Morning", "Zero energy");
      expect(await orderedNames(created.id)).toEqual(["Sip water"]);
    });

    it.each([
      [{ name: "   " }, "RR-VAL-001"],
      [{ minutes: 0 }, "RR-VAL-002"],
      [{ minutes: 601 }, "RR-VAL-002"],
      [{ minutes: 2.5 }, "RR-VAL-002"],
      [{ videoUrl: "https://example.com/video" }, "RR-VAL-003"],
      [{ smaller: { minutes: 0, text: "" } }, "RR-VAL-002"],
      [
        {
          recurrence: {
            kind: "custom" as const,
            days: [9],
            n: 1,
            per: "week" as const,
            ends: "never" as const,
          },
        },
        "RR-VAL-004",
      ],
    ])("rejects invalid input %o with %s and writes nothing", async (overrides, code) => {
      const morning = await sectionByName("Morning");
      const before = await t.db.tasks.count();
      const result = await createTask(t.ctx, {
        draft: draft(morning.id, overrides),
        copyToLevels: [],
      });
      expect(result.ok ? null : result.error.code).toBe(code);
      expect(await t.db.tasks.count()).toBe(before);
    });

    it("rejects a deleted section with RR-DB-005", async () => {
      const morning = await sectionByName("Morning");
      await t.db.sections.update(morning.id, { deleted_at: "2026-09-01T00:00:00Z" });
      const result = await createTask(t.ctx, { draft: draft(morning.id), copyToLevels: [] });
      expect(result.ok ? null : result.error.code).toBe("RR-DB-005");
    });

    it("keeps a single emoji grapheme and caps long text to the database limits", async () => {
      const morning = await sectionByName("Morning");
      await createTask(t.ctx, {
        draft: draft(morning.id, {
          name: "x".repeat(200),
          emoji: "👨‍👩‍👧 extra",
          mantra: "m".repeat(500),
          location: "l".repeat(500),
        }),
        copyToLevels: [],
      });
      const task = (await t.db.tasks.toArray()).find((x) => x.name.startsWith("xxx"));
      expect(task?.name).toHaveLength(80);
      expect(task?.emoji).toBe("👨‍👩‍👧");
      expect(task?.mantra).toHaveLength(300);
      expect(task?.location).toHaveLength(120);
    });
  });

  describe("updateTask / patchTask", () => {
    it("saves the form, keeps step ids, logs the time change", async () => {
      const dinner = await taskByName("Prepare dinner");
      const evening = await sectionByName("Evening");
      const result = await updateTask(t.ctx, {
        taskId: dinner.id,
        draft: draft(evening.id, {
          name: "Prepare dinner",
          emoji: "🍲",
          minutes: 45,
          hard: true,
          steps: dinner.steps,
        }),
        copyToLevels: [],
      });
      expect(result.ok).toBe(true);
      const saved = await taskByName("Prepare dinner");
      expect(saved.minutes).toBe(45);
      expect(saved.steps.map((s) => s.id)).toEqual(dinner.steps.map((s) => s.id));
      const entry = (await t.db.log_entries.where("kind").equals("edited").toArray()).at(-1);
      expect(entry?.meta).toBe("Estimated time 60 min → 45 min");
    });

    it("moving to another section through the form appends it there", async () => {
      const pint = await taskByName("Drink a pint");
      const evening = await sectionByName("Evening");
      await updateTask(t.ctx, {
        taskId: pint.id,
        draft: draft(evening.id, { name: pint.name, emoji: pint.emoji, minutes: pint.minutes }),
        copyToLevels: [],
      });
      expect((await orderedNames(evening.id)).at(-1)).toBe("Drink a pint");
    });

    it("keeps smaller-version fields the form doesn't edit", async () => {
      const pint = await taskByName("Drink a pint");
      await t.db.tasks.update(pint.id, {
        smaller_versions: { minutes: 1, steps: [{ id: "x", text: "Sip" }] },
      });
      const morning = await sectionByName("Morning");
      await updateTask(t.ctx, {
        taskId: pint.id,
        draft: draft(morning.id, {
          name: pint.name,
          minutes: 2,
          smaller: { minutes: null, text: "Just a sip" },
        }),
        copyToLevels: [],
      });
      expect((await taskByName("Drink a pint")).smaller_versions).toEqual({
        steps: [{ id: "x", text: "Sip" }],
        text: "Just a sip",
      });
    });

    it("patchTask edits one field inline and logs it; no change writes nothing", async () => {
      const pint = await taskByName("Drink a pint");
      const logs = await t.db.log_entries.count();
      await patchTask(t.ctx, { taskId: pint.id, patch: { notes: "Big glass" } });
      expect((await taskByName("Drink a pint")).notes).toBe("Big glass");
      expect(await t.db.log_entries.count()).toBe(logs + 1);
      await patchTask(t.ctx, { taskId: pint.id, patch: { notes: "Big glass" } });
      expect(await t.db.log_entries.count()).toBe(logs + 1);
      const empty = await patchTask(t.ctx, { taskId: pint.id, patch: { name: "  " } });
      expect(empty.ok ? null : empty.error.code).toBe("RR-VAL-001");
    });
  });

  describe("delete / duplicate / copy", () => {
    it("deletes softly (tombstone syncs) and logs it", async () => {
      const pint = await taskByName("Drink a pint");
      await deleteTask(t.ctx, { taskId: pint.id });
      const row = await t.db.tasks.get(pint.id);
      expect(row?.deleted_at).not.toBeNull();
      expect(row?._dirty).toBe(1);
      expect((await deleteTask(t.ctx, { taskId: pint.id })).ok).toBe(false);
    });

    it("duplicates right after the original with fresh step ids", async () => {
      const smash = await sectionByName("Smash it");
      const identify = await taskByName("Identify the avoided task");
      const result = await duplicateTask(t.ctx, { taskId: identify.id });
      expect(result.ok).toBe(true);
      expect(await orderedNames(smash.id)).toEqual([
        "Identify the avoided task",
        "Identify the avoided task copy",
        "Send the imperfect message",
        "Book the dentist",
      ]);
      const copy = await taskByName("Identify the avoided task copy");
      expect(copy.steps.map((s) => s.text)).toEqual(identify.steps.map((s) => s.text));
      expect(copy.steps[0]?.id).not.toBe(identify.steps[0]?.id);
    });

    it("copies to a plan's first section, or refuses with RR-VAL-006", async () => {
      const plans = await t.db.day_plans.toArray();
      const travelling = plans.find((p) => p.name === "Travelling");
      const pint = await taskByName("Drink a pint");
      const ok = await copyTaskToPlan(t.ctx, { taskId: pint.id, planId: travelling?.id ?? "" });
      expect(ok.ok && ok.value).toEqual({ planName: "Travelling", sectionName: "Before leaving" });

      const empty = plans.find((p) => p.name === "Zero energy");
      for (const l of await t.db.plan_sections
        .where("plan_id")
        .equals(empty?.id ?? "")
        .toArray()) {
        await t.db.plan_sections.update([l.plan_id, l.section_id], { deleted_at: "x" });
      }
      const refused = await copyTaskToPlan(t.ctx, { taskId: pint.id, planId: empty?.id ?? "" });
      expect(refused.ok ? null : refused.error.userMessage).toBe(
        "Zero energy has no sections yet.",
      );
    });
  });

  describe("moveTask", () => {
    it("reorders within a section without logging", async () => {
      const morning = await sectionByName("Morning");
      const back = await taskByName("Straighten your back");
      const logs = await t.db.log_entries.count();
      await moveTask(t.ctx, {
        taskId: back.id,
        sectionId: morning.id,
        afterTaskId: null,
        via: "drag",
      });
      expect(await orderedNames(morning.id)).toEqual([
        "Straighten your back",
        "Drink a pint",
        "Eat something",
      ]);
      expect(await t.db.log_entries.count()).toBe(logs);
    });

    it("dropping in its current place is a no-op", async () => {
      const morning = await sectionByName("Morning");
      const pint = await taskByName("Drink a pint");
      const result = await moveTask(t.ctx, {
        taskId: pint.id,
        sectionId: morning.id,
        afterTaskId: null,
        via: "drag",
      });
      expect(result.ok && result.value.moved).toBe(false);
    });

    it("moves between sections at a position and logs `… by drag`", async () => {
      const evening = await sectionByName("Evening");
      const pint = await taskByName("Drink a pint");
      const dinner = await taskByName("Prepare dinner");
      await moveTask(t.ctx, {
        taskId: pint.id,
        sectionId: evening.id,
        afterTaskId: dinner.id,
        via: "drag",
      });
      expect(await orderedNames(evening.id)).toEqual([
        "Prepare dinner",
        "Drink a pint",
        "Foot soak and cream",
        "Tidy one surface",
      ]);
      const entry = (await t.db.log_entries.where("kind").equals("edited").toArray()).at(-1);
      expect(entry).toMatchObject({
        title: "Moved Drink a pint",
        meta: "Morning → Evening, by drag",
      });
    });

    it("works when siblings share a rank (renumbers them)", async () => {
      const morning = await sectionByName("Morning");
      for (const task of await t.db.tasks.where("section_id").equals(morning.id).toArray()) {
        await t.db.tasks.update(task.id, { rank: "a0" });
      }
      const dinner = await taskByName("Prepare dinner");
      const [first, second] = (
        await t.db.tasks.where("section_id").equals(morning.id).toArray()
      ).sort(compareRank);
      const result = await moveTask(t.ctx, {
        taskId: dinner.id,
        sectionId: morning.id,
        afterTaskId: first?.id ?? null,
        via: "drag",
      });
      expect(result.ok).toBe(true);
      const names = await orderedNames(morning.id);
      expect(names.indexOf("Prepare dinner")).toBe(1);
      expect(names[0]).toBe(first?.name);
      expect(names[2]).toBe(second?.name);
    });

    it("appends at the end when no position is given, logging a sheet move", async () => {
      const evening = await sectionByName("Evening");
      const pint = await taskByName("Drink a pint");
      await moveTask(t.ctx, { taskId: pint.id, sectionId: evening.id, via: "sheet" });
      expect((await orderedNames(evening.id)).at(-1)).toBe("Drink a pint");
      const entry = (await t.db.log_entries.where("kind").equals("edited").toArray()).at(-1);
      expect(entry?.meta).toBe("Morning → Evening");
    });
  });

  describe("importPastedList", () => {
    it("imports separate tasks with subtasks and writes ONE imported entry", async () => {
      const morning = await sectionByName("Morning");
      const parsed = parsePastedList(
        "Morning reset\n  Open the curtains\n  Drink water\nBrush teeth (5 min)\nShower (15 min)",
        15,
      );
      if (!parsed || "tooLong" in parsed) throw new Error("expected a parse");
      const before = await t.db.log_entries.count();
      const result = await importPastedList(t.ctx, {
        sectionId: morning.id,
        tasks: parsed.asSeparateTasks,
      });
      expect(result.ok && result.value.taskIds).toHaveLength(3);
      expect((await orderedNames(morning.id)).slice(-3)).toEqual([
        "Morning reset",
        "Brush teeth",
        "Shower",
      ]);
      expect((await taskByName("Brush teeth")).minutes).toBe(5);
      expect((await taskByName("Morning reset")).steps.map((s) => s.text)).toEqual([
        "Open the curtains",
        "Drink water",
      ]);
      expect(await t.db.log_entries.count()).toBe(before + 1);
      const entry = (await t.db.log_entries.where("kind").equals("imported").toArray()).at(-1);
      expect(entry?.meta).toBe("3 tasks · 2 subtasks → Morning");
    });

    it("refuses an empty import (RR-IMP-001) and an oversized one (RR-IMP-002)", async () => {
      const morning = await sectionByName("Morning");
      const empty = await importPastedList(t.ctx, { sectionId: morning.id, tasks: [] });
      expect(empty.ok ? null : empty.error.code).toBe("RR-IMP-001");
      const one: PastedTaskDraft = {
        name: "x",
        emoji: "📋",
        minutes: 5,
        smallerMinutes: 2,
        hard: false,
        subtasks: [],
      };
      const big = await importPastedList(t.ctx, {
        sectionId: morning.id,
        tasks: Array.from({ length: 201 }, () => one),
      });
      expect(big.ok ? null : big.error.code).toBe("RR-IMP-002");
    });
  });
});
