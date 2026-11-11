import { DEFAULT_MANTRA } from "@/data/commands/tasks";
import type { TaskDraft } from "@/data/commands/validate";
import { FALLBACK_EMOJI, matchEmoji } from "@/domain/emoji";
import type { Recurrence, Task } from "@/domain/types";

export interface StepDraft {
  /** Stable React key (a saved step's id, or a client key for a new one). */
  readonly key: string;
  readonly id?: string;
  readonly text: string;
}

/** Everything the New / Edit task form edits (handoff screen 10: all fields open). */
export interface TaskFormState {
  readonly name: string;
  readonly emoji: string;
  /** The user picked the emoji; stop suggesting from the name. */
  readonly emojiChosen: boolean;
  readonly minutes: number;
  readonly hard: boolean;
  readonly planId: string | null;
  readonly sectionId: string | null;
  readonly steps: readonly StepDraft[];
  readonly mantra: string;
  readonly notes: string;
  readonly videoUrl: string;
  readonly location: string;
  readonly recurrence: Recurrence | null;
  readonly neverShrink: boolean;
  readonly smallerMinutes: number | null;
  readonly smallerText: string;
  /** "Also add to": other sections of the current plan. */
  readonly copyToSectionIds: readonly string[];
  /** "Also add to": other Day Plans. */
  readonly copyToPlanIds: readonly string[];
  /** "Keep them coupled": the copies share this task's edits (handoff "Coupling"). */
  readonly copyCoupled: boolean;
}

export const MINUTE_CHOICES = [5, 15, 30, 60] as const;

let keySeq = 0;
export function newStepKey(): string {
  keySeq += 1;
  return `new-${keySeq}`;
}

export function newTaskState(planId: string | null, sectionId: string | null): TaskFormState {
  return {
    name: "",
    emoji: FALLBACK_EMOJI,
    emojiChosen: false,
    minutes: 15,
    hard: false,
    planId,
    sectionId,
    steps: [],
    mantra: DEFAULT_MANTRA,
    notes: "",
    videoUrl: "",
    location: "",
    recurrence: null,
    neverShrink: false,
    smallerMinutes: null,
    smallerText: "",
    copyToSectionIds: [],
    copyToPlanIds: [],
    copyCoupled: false,
  };
}

export function stateFromTask(task: Task, planId: string | null): TaskFormState {
  return {
    name: task.name,
    emoji: task.emoji,
    emojiChosen: true,
    minutes: task.minutes,
    hard: task.hard,
    planId,
    sectionId: task.section_id,
    steps: task.steps.map((s) => ({ key: s.id, id: s.id, text: s.text })),
    mantra: task.mantra,
    notes: task.notes,
    videoUrl: task.video_url,
    location: task.location,
    recurrence: task.recurrence,
    neverShrink: task.never_shrink,
    smallerMinutes: task.smaller_versions.minutes ?? null,
    smallerText: task.smaller_versions.text ?? "",
    copyToSectionIds: [],
    copyToPlanIds: [],
    copyCoupled: false,
  };
}

/** Name changes suggest an emoji until the user picks one (PRD R16). */
export function withName(state: TaskFormState, name: string): TaskFormState {
  return state.emojiChosen
    ? { ...state, name }
    : { ...state, name, emoji: matchEmoji(name) ?? FALLBACK_EMOJI };
}

/** The task's own section can't also be a copy target. */
export function withSection(state: TaskFormState, sectionId: string): TaskFormState {
  return {
    ...state,
    sectionId,
    copyToSectionIds: state.copyToSectionIds.filter((id) => id !== sectionId),
  };
}

/** Section picks belong to the plan they were made in, and a plan can't be its own copy. */
export function withPlan(
  state: TaskFormState,
  planId: string,
  sectionId: string | null,
): TaskFormState {
  return {
    ...state,
    planId,
    sectionId,
    copyToSectionIds: [],
    copyToPlanIds: state.copyToPlanIds.filter((id) => id !== planId),
  };
}

export function toDraft(state: TaskFormState, sectionId: string): TaskDraft {
  return {
    name: state.name,
    emoji: state.emoji,
    minutes: state.minutes,
    hard: state.hard,
    sectionId,
    steps: state.steps.map((s) => ({ id: s.id, text: s.text })),
    mantra: state.mantra,
    notes: state.notes,
    videoUrl: state.videoUrl,
    location: state.location,
    recurrence: state.recurrence,
    neverShrink: state.neverShrink,
    smaller: { minutes: state.smallerMinutes, text: state.smallerText },
  };
}

/** True when the form differs from what it opened with: there is something to save or discard. */
export function isDirty(initial: TaskFormState, current: TaskFormState): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}
