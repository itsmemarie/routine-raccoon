import {
  accountCopy,
  describeTaskChange,
  movedViaSheetCopy,
  planAddedCopy,
  planArchivedCopy,
  planDeletedCopy,
  planDescribedCopy,
  planDuplicatedCopy,
  planPrimaryCopy,
  planRenamedCopy,
  planRestoredCopy,
  planSurvivalCopy,
  resetTimeCopy,
  sectionAddedCopy,
  sectionArchivedCopy,
  sectionCopiedCopy,
  sectionDeletedCopy,
  sectionDuplicatedCopy,
  sectionEditedCopy,
  sectionLengthLabel,
  sectionMovedCopy,
  sectionRemovedFromPlanCopy,
  sectionRestoredCopy,
  survivalRenamedCopy,
  taskAddedCopy,
  taskCopiedCopy,
  taskCopiedToSurvivalCopy,
  taskDeletedCopy,
  taskDuplicatedCopy,
  taskEditedCopy,
} from "./log";

describe("log copy (handoff wording)", () => {
  it("tasks", () => {
    expect(taskAddedCopy({ name: "Shower", minutes: 15, hard: true }, "Morning")).toEqual({
      kind: "added",
      title: "Added Shower",
      meta: "Morning · 15 min · hard",
    });
    expect(taskAddedCopy({ name: "Shower", minutes: 15, hard: false }, "Morning").meta).toBe(
      "Morning · 15 min",
    );
    expect(taskCopiedToSurvivalCopy({ name: "Eat" }, "Bad day").meta).toBe("Copy in Bad day");
    expect(taskEditedCopy({ name: "Eat" }, "Notes")).toMatchObject({
      kind: "edited",
      meta: "Notes",
    });
    expect(taskDeletedCopy({ name: "Eat" }, "Morning").meta).toBe("Morning · history kept");
    expect(taskDuplicatedCopy({ name: "Eat" }, "Morning").title).toBe("Duplicated Eat");
    expect(taskCopiedCopy({ name: "Eat" }, "Travelling", "Before leaving").meta).toBe(
      "To Travelling · Before leaving",
    );
    expect(movedViaSheetCopy({ name: "Eat" }, "Morning", "Evening").meta).toBe("Morning → Evening");
  });

  it("describes the most telling task change", () => {
    expect(describeTaskChange({ minutes: 15 }, { minutes: 30 }, ["Notes"])).toBe(
      "Estimated time 15 min → 30 min",
    );
    expect(describeTaskChange({ minutes: 15 }, { minutes: 15 }, ["Notes", "Steps", "Name"])).toBe(
      "Notes, Steps",
    );
    expect(describeTaskChange({ minutes: 15 }, { minutes: 15 }, [])).toBe("Saved");
  });

  it("sections", () => {
    expect(sectionAddedCopy("Morning", "Normal", "07:00", "every day").meta).toBe(
      "Normal · 07:00 · every day",
    );
    expect(sectionAddedCopy("Morning", "Normal", null, "every day").meta).toBe(
      "Normal · every day",
    );
    expect(sectionEditedCopy("Morning", "07:00", "every week").meta).toBe("07:00 · every week");
    expect(sectionDuplicatedCopy("Morning", "Normal").title).toBe("Duplicated section Morning");
    expect(sectionCopiedCopy("Morning", "Travelling").meta).toBe("To Travelling");
    expect(sectionMovedCopy("Morning", "Travelling").kind).toBe("edited");
    expect(sectionRemovedFromPlanCopy("Morning", "Travelling").meta).toBe("From Travelling");
    expect(sectionArchivedCopy("Morning").meta).toBe("Tasks kept in the Log");
    expect(sectionRestoredCopy("Morning").meta).toBe("Back on Today");
    expect(sectionDeletedCopy("Morning").meta).toBe("With its tasks");
  });

  it("Day Plans", () => {
    expect(planAddedCopy("Holiday").title).toBe("Added Day Plan Holiday");
    expect(planRenamedCopy("Old", "New")).toMatchObject({
      title: "Renamed Day Plan Old",
      meta: "Now New",
    });
    expect(planDescribedCopy("Normal").meta).toBe("Description");
    expect(planPrimaryCopy("Travelling").title).toBe("Made Travelling the primary Day Plan");
    expect(planSurvivalCopy("Rest", "Survival Mode", true).title).toBe(
      "Added Rest to Survival Mode",
    );
    expect(planSurvivalCopy("Rest", "Survival Mode", false).title).toBe(
      "Removed Rest from Survival Mode",
    );
    expect(planDuplicatedCopy("Normal").meta).toBe("With its sections");
    expect(planArchivedCopy("Normal").meta).toBe("Sections kept with it");
    expect(planRestoredCopy("Normal").meta).toBe("Back in Day Plans");
    expect(planDeletedCopy("Normal").meta).toBe("With its sections and tasks");
  });

  it("settings and account", () => {
    expect(resetTimeCopy("2:00 AM", "Survival Mode")).toEqual({
      kind: "edited",
      title: "Day reset time set to 2:00 AM",
      meta: "Survival Mode Days end here",
    });
    expect(survivalRenamedCopy("Survival Mode", "Nope Day").meta).toBe("Now Nope Day");
    expect(accountCopy("created", "a@b.c").title).toBe("Account created");
    expect(accountCopy("signed-in", "x").title).toBe("Signed in");
    expect(accountCopy("signed-in", "x", "google").title).toBe("Signed in with Google");
    expect(accountCopy("deleted", "x").title).toBe("Account deleted");
  });

  it("section length label", () => {
    expect(sectionLengthLabel(45, 25)).toBe("45m set");
    expect(sectionLengthLabel(null, 25)).toBe("25m from tasks");
    expect(sectionLengthLabel(null, 90)).toBe("1h 30m from tasks");
  });
});

describe("log filters", () => {
  it("maps UI filters to kinds per the handoff table", async () => {
    const { matchesLogFilter } = await import("./log");
    expect(matchesLogFilter("all", "closed")).toBe(true);
    expect(matchesLogFilter("added", "imported")).toBe(true);
    expect(matchesLogFilter("edited", "skipped")).toBe(true);
    expect(matchesLogFilter("edited", "uncompleted")).toBe(true);
    expect(matchesLogFilter("completed", "closed")).toBe(false);
    expect(matchesLogFilter("survival", "survival")).toBe(true);
  });
});
