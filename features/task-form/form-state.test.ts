import { describe, expect, it } from "vitest";
import { isDirty, newTaskState, withName, withPlan, withSection } from "./form-state";

describe("isDirty", () => {
  const initial = { ...newTaskState("plan", "section"), emoji: "🦷", emojiChosen: true };

  it("is false until something changes, and again once the change is undone", () => {
    expect(isDirty(initial, { ...initial })).toBe(false);
    const edited = withName(initial, "Book the dentist");
    expect(isDirty(initial, edited)).toBe(true);
    expect(isDirty(initial, withName(edited, ""))).toBe(false);
  });

  it("counts a changed emoji on a task that already had one chosen", () => {
    expect(isDirty(initial, { ...initial, emoji: "🦝" })).toBe(true);
  });

  it("counts a picked copy", () => {
    expect(isDirty(initial, { ...initial, copyToSectionIds: ["evening"] })).toBe(true);
    expect(isDirty(initial, { ...initial, copyToPlanIds: ["travelling"] })).toBe(true);
  });
});

describe("Also add to picks", () => {
  const picked = {
    ...newTaskState("normal", "morning"),
    copyToSectionIds: ["smash", "evening"],
    copyToPlanIds: ["travelling", "bad"],
  };

  it("drops a section from the copies once it becomes the task's own section", () => {
    expect(withSection(picked, "evening")).toMatchObject({
      sectionId: "evening",
      copyToSectionIds: ["smash"],
      copyToPlanIds: ["travelling", "bad"],
    });
  });

  it("clears section picks on a plan change: they belonged to the old plan", () => {
    expect(withPlan(picked, "weekend", "brunch")).toMatchObject({
      planId: "weekend",
      sectionId: "brunch",
      copyToSectionIds: [],
      copyToPlanIds: ["travelling", "bad"],
    });
  });

  it("drops a plan from the copies once it becomes the task's own plan", () => {
    expect(withPlan(picked, "travelling", null)).toMatchObject({
      planId: "travelling",
      sectionId: null,
      copyToPlanIds: ["bad"],
    });
  });
});
