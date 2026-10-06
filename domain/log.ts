import { formatDuration } from "./duration";
import type { LogKind } from "./types";

/**
 * Log entry copy. Keeping titles and metas here (not in UI or commands) means the Log screen,
 * the commands and the tests all agree on the exact wording.
 * @see docs/handoff/README.md "Log" and "Tick, undo, day complete"
 */
export interface LogCopy {
  readonly kind: LogKind;
  readonly title: string;
  readonly meta: string;
}

const join = (...bits: (string | false | null | undefined)[]) =>
  bits.filter((b): b is string => typeof b === "string" && b.length > 0).join(" · ");

/** Tick: meta `"{section} · {min} min estimated · hard task"`. */
export function completedCopy(
  task: { name: string; hard: boolean },
  sectionName: string,
  minutes: number,
): LogCopy {
  return {
    kind: "completed",
    title: `Completed ${task.name}`,
    meta: join(sectionName, `${minutes} min estimated`, task.hard && "hard task"),
  };
}

export function uncompletedCopy(task: { name: string }, sectionName: string): LogCopy {
  return { kind: "uncompleted", title: `Un-ticked ${task.name}`, meta: sectionName };
}

export function skippedCopy(task: { name: string }, sectionName: string): LogCopy {
  return { kind: "skipped", title: `Skipped ${task.name}`, meta: join(sectionName, "today only") };
}

/** Drag between sections: title "Moved {task}", meta "{from} → {to}, by drag". */
export function movedCopy(task: { name: string }, from: string, to: string): LogCopy {
  return { kind: "edited", title: `Moved ${task.name}`, meta: `${from} → ${to}, by drag` };
}

/** Move from the copy/move sheet (not a drag). */
export function movedViaSheetCopy(task: { name: string }, from: string, to: string): LogCopy {
  return { kind: "edited", title: `Moved ${task.name}`, meta: `${from} → ${to}` };
}

/** Plan picker: every pick writes a `survival` entry, on or off. */
export function planPickedCopy(
  planName: string,
  options: { readonly survival: boolean; readonly survivalName: string },
): LogCopy {
  return options.survival
    ? {
        kind: "survival",
        title: `${options.survivalName}: ${planName}`,
        meta: "Picked from Today's plan",
      }
    : { kind: "survival", title: `Switched to ${planName}`, meta: `${options.survivalName} off` };
}

/** Close the day: meta `"{ticked} of {total} ticked"`. */
export function closedCopy(ticked: number, total: number): LogCopy {
  return { kind: "closed", title: "Closed the day", meta: `${ticked} of ${total} ticked` };
}

export function importedCopy(meta: string): LogCopy {
  return { kind: "imported", title: "Pasted a list", meta };
}

// ── Tasks ────────────────────────────────────────────────────────────────────────────────

export function taskAddedCopy(
  task: { name: string; minutes: number; hard: boolean },
  sectionName: string,
): LogCopy {
  return {
    kind: "added",
    title: `Added ${task.name}`,
    meta: join(sectionName, `${task.minutes} min`, task.hard && "hard"),
  };
}

export function taskCopiedToSurvivalCopy(task: { name: string }, planName: string): LogCopy {
  return { kind: "added", title: `Added ${task.name}`, meta: `Copy in ${planName}` };
}

/** Edit: names the most telling change, e.g. "Estimated time 15 min → 30 min". */
export function taskEditedCopy(task: { name: string }, change: string): LogCopy {
  return { kind: "edited", title: `Edited ${task.name}`, meta: change };
}

export function taskDeletedCopy(task: { name: string }, sectionName: string): LogCopy {
  return { kind: "edited", title: `Deleted ${task.name}`, meta: join(sectionName, "history kept") };
}

export function taskDuplicatedCopy(task: { name: string }, sectionName: string): LogCopy {
  return { kind: "added", title: `Duplicated ${task.name}`, meta: sectionName };
}

export function taskCopiedCopy(
  task: { name: string },
  planName: string,
  sectionName: string,
): LogCopy {
  return { kind: "added", title: `Copied ${task.name}`, meta: `To ${planName} · ${sectionName}` };
}

// ── Sections ─────────────────────────────────────────────────────────────────────────────

export function sectionAddedCopy(
  name: string,
  planName: string,
  startTime: string | null,
  repeats: string,
): LogCopy {
  return {
    kind: "added",
    title: `Added section ${name}`,
    meta: join(planName, startTime, repeats),
  };
}

export function sectionEditedCopy(
  name: string,
  startTime: string | null,
  repeats: string,
): LogCopy {
  return { kind: "edited", title: `Edited section ${name}`, meta: join(startTime, repeats) };
}

export function sectionDuplicatedCopy(name: string, planName: string): LogCopy {
  return { kind: "added", title: `Duplicated section ${name}`, meta: planName };
}

export function sectionCopiedCopy(name: string, planName: string): LogCopy {
  return { kind: "added", title: `Copied section ${name}`, meta: `To ${planName}` };
}

export function sectionMovedCopy(name: string, planName: string): LogCopy {
  return { kind: "edited", title: `Moved section ${name}`, meta: `To ${planName}` };
}

export function sectionRemovedFromPlanCopy(name: string, planName: string): LogCopy {
  return { kind: "edited", title: `Removed section ${name}`, meta: `From ${planName}` };
}

export function sectionArchivedCopy(name: string): LogCopy {
  return { kind: "edited", title: `Archived section ${name}`, meta: "Tasks kept in the Log" };
}

export function sectionRestoredCopy(name: string): LogCopy {
  return { kind: "edited", title: `Restored section ${name}`, meta: "Back on Today" };
}

export function sectionDeletedCopy(name: string): LogCopy {
  return { kind: "edited", title: `Deleted section ${name}`, meta: "With its tasks" };
}

// ── Day Plans ────────────────────────────────────────────────────────────────────────────

export function planAddedCopy(name: string): LogCopy {
  return { kind: "added", title: `Added Day Plan ${name}`, meta: "" };
}

export function planRenamedCopy(from: string, to: string): LogCopy {
  return { kind: "edited", title: `Renamed Day Plan ${from}`, meta: `Now ${to}` };
}

export function planDescribedCopy(name: string): LogCopy {
  return { kind: "edited", title: `Edited Day Plan ${name}`, meta: "Description" };
}

export function planPrimaryCopy(name: string): LogCopy {
  return { kind: "edited", title: `Made ${name} the primary Day Plan`, meta: "" };
}

export function planSurvivalCopy(name: string, survivalName: string, on: boolean): LogCopy {
  return on
    ? { kind: "edited", title: `Added ${name} to ${survivalName}`, meta: "" }
    : { kind: "edited", title: `Removed ${name} from ${survivalName}`, meta: "" };
}

export function planDuplicatedCopy(name: string): LogCopy {
  return { kind: "added", title: `Duplicated Day Plan ${name}`, meta: "With its sections" };
}

export function planArchivedCopy(name: string): LogCopy {
  return { kind: "edited", title: `Archived Day Plan ${name}`, meta: "Sections kept with it" };
}

export function planRestoredCopy(name: string): LogCopy {
  return { kind: "edited", title: `Restored ${name}`, meta: "Back in Day Plans" };
}

export function planDeletedCopy(name: string): LogCopy {
  return { kind: "edited", title: `Deleted Day Plan ${name}`, meta: "With its sections and tasks" };
}

// ── Settings and account ─────────────────────────────────────────────────────────────────

export function resetTimeCopy(label: string, survivalName: string): LogCopy {
  return {
    kind: "edited",
    title: `Day reset time set to ${label}`,
    meta: `${survivalName} Days end here`,
  };
}

export function survivalRenamedCopy(from: string, to: string): LogCopy {
  return { kind: "edited", title: `Renamed ${from}`, meta: `Now ${to}` };
}

export function accountCopy(
  event: "created" | "signed-in" | "deleted",
  detail: string,
  provider: "email" | "google" = "email",
): LogCopy {
  switch (event) {
    case "created":
      return { kind: "edited", title: "Account created", meta: detail };
    case "signed-in":
      return {
        kind: "edited",
        title: provider === "google" ? "Signed in with Google" : "Signed in",
        meta: detail,
      };
    case "deleted":
      return { kind: "edited", title: "Account deleted", meta: detail };
  }
}

/** "Estimated time 15 min → 30 min" when the time changed, else the first changed field. */
export function describeTaskChange(
  before: { minutes: number },
  after: { minutes: number },
  changedFields: readonly string[],
): string {
  if (before.minutes !== after.minutes) {
    return `Estimated time ${before.minutes} min → ${after.minutes} min`;
  }
  return changedFields.length > 0 ? changedFields.slice(0, 2).join(", ") : "Saved";
}

/** "45m set" / "25m from tasks" (Sections manager). */
export function sectionLengthLabel(override: number | null, fromTasks: number): string {
  return override !== null
    ? `${formatDuration(override)} set`
    : `${formatDuration(fromTasks)} from tasks`;
}

// ── Log screen filters ───────────────────────────────────────────────────────────────────

export type LogFilter = "all" | "completed" | "added" | "edited" | "survival";

export const LOG_FILTER_LABELS: Record<LogFilter, string> = {
  all: "All",
  completed: "Completed",
  added: "Added",
  edited: "Edited",
  survival: "Survival Mode",
};

/**
 * Which kinds each filter shows (handoff "Log" table). `closed` appears under All only.
 * @see docs/handoff/README.md "Log"
 */
export const LOG_FILTER_KINDS: Record<LogFilter, readonly LogKind[] | null> = {
  all: null,
  completed: ["completed"],
  added: ["added", "imported"],
  edited: ["edited", "uncompleted", "skipped"],
  survival: ["survival"],
};

export function matchesLogFilter(filter: LogFilter, kind: LogKind): boolean {
  const kinds = LOG_FILTER_KINDS[filter];
  return kinds === null || kinds.includes(kind);
}
