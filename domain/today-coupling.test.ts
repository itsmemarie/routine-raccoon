import { link, plan, section, settings, task, testId } from "@/tests/factories";
import { buildToday, type TodayInput } from "./today";

/** The link glyph's counts on Today (handoff "Coupling"). */
describe("buildToday: coupled counts", () => {
  it("counts a task's live copies and a section's other active plans", () => {
    const normal = plan({ name: "Normal", rank: "a0" });
    const travel = plan({ name: "Travel", kind: "custom", rank: "a1" });
    const archived = plan({
      name: "Old",
      kind: "custom",
      rank: "a2",
      archived_at: "2026-09-02T00:00:00.000Z",
    });
    const morning = section({ name: "Morning" });
    const gym = section({ name: "Gym" });
    const gone = section({ name: "Gone", deleted_at: "2026-09-02T00:00:00.000Z" });
    const linkId = testId();
    const pint = task({ section_id: morning.id, link_id: linkId, rank: "a0" });
    const loose = task({ section_id: morning.id, name: "Eat", rank: "a1" });
    const input: TodayInput = {
      dayKey: "2026-09-08",
      plans: [normal, travel, archived],
      planSections: [
        link(normal.id, morning.id),
        link(travel.id, morning.id),
        link(archived.id, morning.id),
        link(travel.id, gym.id, "a1"),
      ],
      sections: [morning, gym, gone],
      tasks: [
        pint,
        loose,
        task({ section_id: gym.id, link_id: linkId }),
        // Neither counts: a deleted copy, and a copy in a deleted section.
        task({ section_id: gym.id, link_id: linkId, deleted_at: "2026-09-02T00:00:00.000Z" }),
        task({ section_id: gone.id, link_id: linkId }),
      ],
      occurrences: [],
      dayRecord: null,
      settings: settings(),
      filter: "all",
    };
    const view = buildToday(input);
    const [first] = view.sections;
    expect(first?.coupledWith).toBe(1);
    expect(first?.tasks.map((t) => [t.task.name, t.coupledWith])).toEqual([
      ["Drink a pint", 1],
      ["Eat", 0],
    ]);
  });
});
