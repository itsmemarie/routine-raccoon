import { defaultSmallerMinutes } from "./duration";
import { suggestEmoji } from "./emoji";

/**
 * Inline "Paste a list" parser (PRD R8). The handoff says "implement exactly", so every rule
 * below maps 1:1 to a bullet in docs/handoff/README.md "Parsing rules", and the unit tests use
 * the same examples.
 */

/** Hard cap so a pasted document can't freeze the form (RR-IMP-002). */
export const MAX_PASTE_LINES = 200;

/** Indented = 2+ leading spaces, a tab, or a leading "– " / "· " (en dash / middle dot). */
const INDENTED = /^(\s{2,}|\t|\s*[–·]\s)/;

/** One list marker after leading whitespace: [ ], [x], [X], -, *, •, ·, –, 1., 1) */
const MARKER = /^(?:\[[ xX]\]|[-*•·–]|\d+[.)])\s*/;

/** Trailing "(15 min)" style duration: min, mins, minutes or m. */
const PAREN_DURATION = /\s*\(\s*(\d{1,3})\s*(?:minutes|mins|min|m)\s*\)\s*$/i;

/** Trailing "- 15 min" / "– 15 min" style duration. */
const DASH_DURATION = /\s+[-–]\s+(\d{1,3})\s*(?:minutes|mins|min|m)\s*$/i;

export interface ParsedLine {
  readonly text: string;
  readonly indented: boolean;
  /** Minutes read from a trailing duration, clamped to 1–600; null when absent. */
  readonly minutes: number | null;
}

export interface PastedTaskDraft {
  readonly name: string;
  readonly emoji: string;
  readonly minutes: number;
  readonly smallerMinutes: number;
  readonly hard: false;
  readonly subtasks: readonly string[];
}

export interface PasteParseResult {
  /** Non-blank lines after parsing. */
  readonly lines: readonly ParsedLine[];
  /** "Separate tasks" choice: non-indented lines become tasks, indented lines their subtasks. */
  readonly asSeparateTasks: readonly PastedTaskDraft[];
  /** "One task with subtasks" choice: first line is the task, every other line a subtask. */
  readonly asOneTask: PastedTaskDraft | null;
}

function clampMinutes(value: number): number {
  return Math.min(600, Math.max(1, value));
}

/** Strips leading whitespace and exactly one list marker. */
export function stripMarker(line: string): string {
  return line.trimStart().replace(MARKER, "").trim();
}

/** Removes a trailing duration from a task name and returns it separately. */
export function extractDuration(text: string): { text: string; minutes: number | null } {
  for (const pattern of [PAREN_DURATION, DASH_DURATION]) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return { text: text.slice(0, match.index).trim(), minutes: clampMinutes(Number(match[1])) };
    }
  }
  return { text, minutes: null };
}

/** Splits on newlines, drops blank lines, and classifies each remaining line. */
export function parseLines(raw: string): ParsedLine[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const indented = INDENTED.test(line);
      const { text, minutes } = extractDuration(stripMarker(line));
      return { text, indented, minutes };
    })
    .filter((line) => line.text.length > 0);
}

function draft(name: string, minutes: number, subtasks: string[]): PastedTaskDraft {
  return {
    name,
    emoji: suggestEmoji(name),
    minutes,
    smallerMinutes: defaultSmallerMinutes(minutes),
    hard: false,
    subtasks,
  };
}

/**
 * Parses pasted text into both import choices, so the dialog can show live counts for each.
 *
 * @param defaultMinutes The form's current "Estimated time" (default 15), used for lines without a duration.
 * @returns `null` when the paste has fewer than 2 lines (handled as a normal paste) or exceeds MAX_PASTE_LINES
 *          (caller shows RR-IMP-002); otherwise both drafts.
 */
export function parsePastedList(
  raw: string,
  defaultMinutes: number,
): PasteParseResult | { readonly tooLong: true; readonly lineCount: number } | null {
  const lines = parseLines(raw);
  if (lines.length > MAX_PASTE_LINES) return { tooLong: true, lineCount: lines.length };
  if (lines.length < 2) return null;

  // Separate tasks. An indented first line becomes a task (nothing above it to attach to).
  const separate: { name: string; minutes: number; subtasks: string[] }[] = [];
  for (const line of lines) {
    const parent = separate.at(-1);
    if (line.indented && parent) {
      parent.subtasks.push(line.text);
    } else {
      separate.push({ name: line.text, minutes: line.minutes ?? defaultMinutes, subtasks: [] });
    }
  }

  // One task with subtasks: indentation ignored; subtasks keep their text as written.
  const [first, ...rest] = lines;
  const asOneTask = first
    ? draft(
        first.text,
        first.minutes ?? defaultMinutes,
        rest.map((line) => line.text),
      )
    : null;

  return {
    lines,
    asSeparateTasks: separate.map((t) => draft(t.name, t.minutes, t.subtasks)),
    asOneTask,
  };
}

/**
 * Meta for the single `imported` log entry. With the title "Pasted a list" the Log row reads
 * `"Pasted a list · 5 tasks · 3 subtasks → Morning"`.
 */
export function importLogMeta(tasks: readonly PastedTaskDraft[], sectionName: string): string {
  const subtasks = tasks.reduce((sum, t) => sum + t.subtasks.length, 0);
  const parts = [`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`];
  if (subtasks > 0) parts.push(`${subtasks} ${subtasks === 1 ? "subtask" : "subtasks"}`);
  return `${parts.join(" · ")} → ${sectionName}`;
}

/** Toast after import: `"Added 5 tasks"` / `"Added 1 task with 6 subtasks"`. */
export function importToast(tasks: readonly PastedTaskDraft[]): string {
  if (tasks.length === 1 && tasks[0]) {
    const n = tasks[0].subtasks.length;
    return n > 0 ? `Added 1 task with ${n} ${n === 1 ? "subtask" : "subtasks"}` : "Added 1 task";
  }
  return `Added ${tasks.length} tasks`;
}
