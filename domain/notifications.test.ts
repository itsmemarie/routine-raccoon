import { link, occurrence, plan, section, settings, task } from "@/tests/factories";
import { instantOn, notificationId, planSectionNotifications } from "./notifications";
import { buildToday } from "./today";

const DAY = "2026-09-08";

function view(
  makeOccurrences: (tasks: ReturnType<typeof task>[]) => ReturnType<typeof occurrence>[] = () => [],
) {
  const normal = plan({ kind: "primary" });
  const morning = section({ name: "Morning", start_time: "07:00", closing_lead_minutes: 15 });
  const smash = section({ name: "Smash it", start_time: "09:30", notify_before_close: false });
  const night = section({ name: "Night", start_time: "01:00" });
  const quiet = section({ name: "Quiet", start_time: null });
  const tasks = [
    task({ section_id: morning.id, name: "Pint", emoji: "💧", minutes: 2, rank: "a0" }),
    task({ section_id: morning.id, name: "Eat", emoji: "🍞", minutes: 20, rank: "a1" }),
    task({ section_id: smash.id, name: "Call", emoji: "📞", minutes: 15 }),
    task({ section_id: night.id, name: "Sleep", emoji: "🛏️", minutes: 5 }),
    task({ section_id: quiet.id, name: "Rest", minutes: 5 }),
  ];
  return {
    tasks,
    today: buildToday({
      dayKey: DAY,
      plans: [normal],
      planSections: [
        link(normal.id, morning.id, "a0"),
        link(normal.id, smash.id, "a1"),
        link(normal.id, night.id, "a2"),
        link(normal.id, quiet.id, "a3"),
      ],
      sections: [morning, smash, night, quiet],
      tasks,
      occurrences: makeOccurrences(tasks),
      dayRecord: null,
      settings: settings(),
      filter: "all",
    }),
  };
}

describe("instantOn", () => {
  it("places times before the reset at the end of the logical day", () => {
    expect(instantOn(DAY, "07:00", "02:00")).toEqual(new Date(2026, 8, 8, 7, 0));
    expect(instantOn(DAY, "01:00", "02:00")).toEqual(new Date(2026, 8, 9, 1, 0));
    expect(instantOn(DAY, "bad", "02:00")).toBeNull();
  });
});

describe("planSectionNotifications", () => {
  it("block starts names the first unticked task; block closing lists what's open", () => {
    const { today } = view();
    const planned = planSectionNotifications(today, new Date(2026, 8, 8, 6, 0), "02:00");
    expect(planned.map((p) => [p.title, p.body, p.at.getHours(), p.at.getMinutes()])).toEqual([
      ["Morning", "Morning · 💧 Pint · 2 min", 7, 0],
      ["Morning closes in 15 min", "Still open: Pint, Eat", 9, 15],
      ["Smash it", "Smash it · 📞 Call · 15 min", 9, 30],
      ["Night", "Night · 🛏️ Sleep · 5 min", 1, 0],
    ]);
  });

  it("skips past times and sections with nothing open", () => {
    const { today: fresh } = view();
    const done = view((tasks) =>
      tasks.slice(0, 2).map((t) => occurrence({ task_id: t.id, day_key: DAY })),
    ).today;
    const afterNine = new Date(2026, 8, 8, 9, 0);
    expect(planSectionNotifications(fresh, afterNine, "02:00").map((p) => p.title)).toEqual([
      "Morning closes in 15 min",
      "Smash it",
      "Night",
    ]);
    expect(planSectionNotifications(done, afterNine, "02:00").map((p) => p.title)).toEqual([
      "Smash it",
      "Night",
    ]);
  });

  it("ids are stable per section and kind, and distinct", () => {
    expect(notificationId("abc", "start")).toBe(notificationId("abc", "start"));
    expect(notificationId("abc", "start")).not.toBe(notificationId("abc", "closing"));
    expect(notificationId("abc", "start")).toBeGreaterThan(0);
    expect(notificationId("abc", "start")).toBeLessThanOrEqual(800_000);
  });
});
