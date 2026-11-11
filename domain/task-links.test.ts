import { task, testId } from "@/tests/factories";
import { RecurrenceSchema } from "./schemas";
import { linkedCopies, linkedPatch, reconcileGroup, sameLinkedContent } from "./task-links";

describe("task links", () => {
  const sectionId = testId();
  const link = testId();
  let n = 0;
  const newId = () => `new-${++n}`;

  it("linkedCopies lists the other live rows of the same link only", () => {
    const a = task({ section_id: sectionId, link_id: link });
    const b = task({ section_id: sectionId, link_id: link });
    const gone = task({ section_id: sectionId, link_id: link, deleted_at: "2026-09-08T00:00:00Z" });
    const other = task({ section_id: sectionId, link_id: testId() });
    const loose = task({ section_id: sectionId });
    expect(linkedCopies([a, b, gone, other, loose], a)).toEqual([b]);
    expect(linkedCopies([a, loose], loose)).toEqual([]);
  });

  it("linkedPatch copies content but keeps the member's step ids by position", () => {
    const source = task({
      section_id: sectionId,
      name: "Stretch",
      steps: [
        { id: "s1", text: "Neck" },
        { id: "s2", text: "Back" },
        { id: "s3", text: "Legs" },
      ],
      smaller_versions: { minutes: 2, steps: [{ id: "x", text: "Neck only" }] },
    });
    const member = task({
      section_id: sectionId,
      name: "Old",
      steps: [
        { id: "m1", text: "Neck" },
        { id: "m2", text: "Shoulders" },
      ],
    });
    const patch = linkedPatch(source, member, newId);
    expect(patch.name).toBe("Stretch");
    expect(patch.steps.map((s) => s.id)).toEqual(["m1", "m2", expect.stringMatching(/^new-/)]);
    expect(patch.steps.map((s) => s.text)).toEqual(["Neck", "Back", "Legs"]);
    expect(patch.smaller_versions.minutes).toBe(2);
    expect(patch.smaller_versions.steps?.[0]?.id).toMatch(/^new-/);
    expect(sameLinkedContent({ ...member, ...patch }, source)).toBe(true);
  });

  it("reconcileGroup: the most recent edit wins, whatever the offset format", () => {
    const older = task({
      section_id: sectionId,
      link_id: link,
      name: "Older",
      updated_at: "2026-09-08T10:00:00.000Z",
    });
    const newer = task({
      section_id: sectionId,
      link_id: link,
      name: "Newer",
      updated_at: "2026-09-08T10:30:00+00:00",
    });
    const patches = reconcileGroup([older, newer], newId);
    expect(patches).toEqual([{ id: older.id, patch: expect.objectContaining({ name: "Newer" }) }]);
    expect(reconcileGroup([newer, { ...older, name: "Newer" }], newId)).toEqual([]);
  });

  it("clones a recurrence, and an unreadable timestamp never wins", () => {
    const recurrence = RecurrenceSchema.parse({ kind: "every week", days: [1, 3] });
    const source = task({ section_id: sectionId, recurrence });
    const patch = linkedPatch(source, task({ section_id: sectionId }), newId);
    expect(patch.recurrence).toEqual(recurrence);
    expect(patch.recurrence).not.toBe(recurrence);
    const broken = task({ section_id: sectionId, link_id: link, name: "Broken", updated_at: "?" });
    const fine = task({ section_id: sectionId, link_id: link, name: "Fine" });
    expect(reconcileGroup([broken, fine], newId)).toEqual([
      { id: broken.id, patch: expect.objectContaining({ name: "Fine" }) },
    ]);
    expect(reconcileGroup([fine], newId)).toEqual([]);
  });
});
