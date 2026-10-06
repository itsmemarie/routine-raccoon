import {
  extractDuration,
  importLogMeta,
  importToast,
  MAX_PASTE_LINES,
  parseLines,
  parsePastedList,
  stripMarker,
  type PasteParseResult,
} from "./paste-parser";

/** Narrows the union for tests that expect a normal parse. */
function parsed(raw: string, defaultMinutes = 15): PasteParseResult {
  const result = parsePastedList(raw, defaultMinutes);
  if (!result || "tooLong" in result) throw new Error("expected a parse result");
  return result;
}

describe("stripMarker: one marker after leading whitespace", () => {
  it.each([
    ["[ ] Shower", "Shower"],
    ["[x] Shower", "Shower"],
    ["[X] Shower", "Shower"],
    ["- Shower", "Shower"],
    ["* Shower", "Shower"],
    ["• Shower", "Shower"],
    ["· Shower", "Shower"],
    ["– Shower", "Shower"],
    ["1. Shower", "Shower"],
    ["12) Shower", "Shower"],
    ["   - Shower", "Shower"],
    ["Shower", "Shower"],
  ])("%j → %j", (input, expected) => {
    expect(stripMarker(input)).toBe(expected);
  });

  it("strips only ONE marker", () => {
    expect(stripMarker("- [ ] Shower")).toBe("[ ] Shower");
  });
});

describe("extractDuration", () => {
  it.each([
    ["Shower (15 min)", "Shower", 15],
    ["Shower (15 mins)", "Shower", 15],
    ["Shower (15 minutes)", "Shower", 15],
    ["Shower (15m)", "Shower", 15],
    ["Shower - 15 min", "Shower", 15],
    ["Shower – 15 min", "Shower", 15],
    ["Walk (999 min)", "Walk", 600],
    ["Walk (0 min)", "Walk", 1],
  ])("%j → %j, %i", (input, text, minutes) => {
    expect(extractDuration(input)).toEqual({ text, minutes });
  });

  it("leaves names without a trailing duration alone", () => {
    expect(extractDuration("Read 15 min of a book")).toEqual({
      text: "Read 15 min of a book",
      minutes: null,
    });
  });
});

describe("parseLines", () => {
  it("drops blank lines and detects indentation (2+ spaces, tab, '– ', '· ')", () => {
    const lines = parseLines(
      "Morning\n\n  Shower\n\tTeeth\n– Dress\n· Hair\n Single space\n- Hyphen is not indent",
    );
    expect(lines.map((l) => [l.text, l.indented])).toEqual([
      ["Morning", false],
      ["Shower", true],
      ["Teeth", true],
      ["Dress", true],
      ["Hair", true],
      ["Single space", false],
      ["Hyphen is not indent", false],
    ]);
  });

  it("drops lines that are only a marker", () => {
    expect(parseLines("-\nShower")).toHaveLength(1);
  });
});

describe("parsePastedList", () => {
  it("returns null for a one-line paste (normal paste into the field)", () => {
    expect(parsePastedList("Shower", 15)).toBeNull();
    expect(parsePastedList("Shower\n\n", 15)).toBeNull();
  });

  it("refuses pastes over the line cap", () => {
    const raw = Array.from({ length: MAX_PASTE_LINES + 1 }, (_, i) => `Task ${i}`).join("\n");
    expect(parsePastedList(raw, 15)).toEqual({ tooLong: true, lineCount: MAX_PASTE_LINES + 1 });
  });

  it("separate tasks: indented lines attach to the task above", () => {
    const result = parsed(
      "- Shower (10 min)\n  wash hair\n  rinse\n- Breakfast\n- Walk the dog - 20 min",
    );
    expect(result.lines).toHaveLength(5);
    expect(result.asSeparateTasks.map((t) => [t.name, t.minutes, t.subtasks])).toEqual([
      ["Shower", 10, ["wash hair", "rinse"]],
      ["Breakfast", 15, []],
      ["Walk the dog", 20, []],
    ]);
  });

  it("an indented first line becomes a task", () => {
    const result = parsed("  Shower\n  Teeth");
    expect(result.asSeparateTasks.map((t) => [t.name, t.subtasks])).toEqual([
      ["Shower", ["Teeth"]],
    ]);
  });

  it("one task with subtasks: first line is the task, the rest subtasks, indentation ignored", () => {
    const result = parsed("Evening reset (30 min)\n- Dishes\n  - Wipe counter\n- Bins");
    expect(result.asOneTask).toMatchObject({
      name: "Evening reset",
      minutes: 30,
      subtasks: ["Dishes", "Wipe counter", "Bins"],
    });
  });

  it("applies created-task defaults: not hard, smaller = max(2, round(min/2)), emoji or 📋", () => {
    const result = parsed("Shower (3 min)\nSort the garage", 20);
    expect(result.asSeparateTasks).toEqual([
      { name: "Shower", emoji: "🚿", minutes: 3, smallerMinutes: 2, hard: false, subtasks: [] },
      {
        name: "Sort the garage",
        emoji: "📋",
        minutes: 20,
        smallerMinutes: 10,
        hard: false,
        subtasks: [],
      },
    ]);
  });

  it("handles Windows line endings", () => {
    expect(parsed("Shower\r\nTeeth").asSeparateTasks).toHaveLength(2);
  });
});

describe("import copy", () => {
  const tasks = parsed("Shower\n  a\n  b\nTeeth\n  c\nDress\nHair\nBed").asSeparateTasks;

  it("log meta names counts and the destination section", () => {
    expect(importLogMeta(tasks, "Morning")).toBe("5 tasks · 3 subtasks → Morning");
    expect(importLogMeta(tasks.slice(3, 4), "Morning")).toBe("1 task → Morning");
    expect(importLogMeta(tasks.slice(1, 2), "Evening")).toBe("1 task · 1 subtask → Evening");
  });

  it("toast copy", () => {
    expect(importToast(tasks)).toBe("Added 5 tasks");
    const one = parsed("Reset\nA\nB\nC\nD\nE\nF").asOneTask;
    expect(one && importToast([one])).toBe("Added 1 task with 6 subtasks");
    expect(importToast(tasks.slice(1, 2))).toBe("Added 1 task with 1 subtask");
    expect(importToast(tasks.slice(3, 4))).toBe("Added 1 task");
  });
});
