import { suggestEmoji } from "@/domain/emoji";
import { RecurrenceSchema } from "@/domain/schemas";
import { parseHHMM } from "@/domain/time";
import type { Recurrence, SmallerVersion, Step } from "@/domain/types";
import { parseVideoUrl } from "@/domain/video";
import { AppError } from "@/lib/errors/app-error";
import { requireName } from "./shared";

/**
 * Input validation for commands (TECH_SPEC §2.5 step 2). Every rule maps to a registered
 * RR-VAL code so the form can show it inline with the page ID.
 */

/** Limits mirror the Postgres check constraints, so a saved row is never refused on push. */
export const LIMITS = {
  name: 80,
  emoji: 16,
  mantra: 300,
  notes: 4000,
  location: 120,
  video: 500,
  stepText: 300,
  steps: 50,
  description: 4000,
} as const;

export function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/** Minutes 1–600 (tasks.minutes check). RR-VAL-002 otherwise. */
export function requireMinutes(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 600) {
    throw new AppError("RR-VAL-002", { context: { minutes: Number.isFinite(value) ? value : -1 } });
  }
  return value;
}

/** Empty, or a YouTube/TikTok link we can embed safely. RR-VAL-003 otherwise. */
export function requireVideoUrl(value: string): string {
  const url = value.trim();
  if (url === "") return "";
  if (url.length > LIMITS.video || !parseVideoUrl(url)) throw new AppError("RR-VAL-003");
  return url;
}

/** "HH:MM" 24h or null. RR-VAL-004 otherwise. */
export function requireTimeOrNull(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  if (parseHHMM(value.trim()) === null) throw new AppError("RR-VAL-004");
  return value.trim();
}

/** A valid recurrence (or null = every day). A bad end date maps to RR-VAL-004. */
export function requireRecurrence(value: Recurrence | null): Recurrence | null {
  if (value === null) return null;
  const parsed = RecurrenceSchema.safeParse(value);
  if (!parsed.success) throw new AppError("RR-VAL-004", { context: { field: "recurrence" } });
  return parsed.data;
}

/** The first user-perceived character (keeps ZWJ sequences and flags whole). */
export function firstGrapheme(value: string): string {
  const text = value.trim();
  if (text === "") return "";
  const first = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(text)
    [Symbol.iterator]()
    .next();
  return first.done ? "" : first.value.segment;
}

/** One emoji (first grapheme); falls back to the suggestion for the name. */
export function normaliseEmoji(value: string, name: string): string {
  const emoji = firstGrapheme(value);
  if (emoji === "" || emoji.length > LIMITS.emoji) return suggestEmoji(name);
  return emoji;
}

/** Drops blank steps, trims and caps text, keeps existing ids and mints ids for new steps. */
export function normaliseSteps(
  steps: readonly { readonly id?: string | undefined; readonly text: string }[],
  newId: () => string,
): Step[] {
  return steps
    .map((s) => ({
      id: s.id && s.id.length > 0 ? s.id : newId(),
      text: clampText(s.text, LIMITS.stepText),
    }))
    .filter((s) => s.text.length > 0)
    .slice(0, LIMITS.steps);
}

export interface TaskDraft {
  readonly name: string;
  readonly emoji: string;
  readonly minutes: number;
  readonly hard: boolean;
  readonly sectionId: string;
  readonly steps: readonly { readonly id?: string | undefined; readonly text: string }[];
  readonly mantra: string;
  readonly notes: string;
  readonly videoUrl: string;
  readonly location: string;
  readonly recurrence: Recurrence | null;
  readonly neverShrink: boolean;
  /** Smaller version: null minutes = automatic (half, at least 2). */
  readonly smaller: { readonly minutes: number | null; readonly text: string };
}

export interface ValidTaskFields {
  readonly name: string;
  readonly emoji: string;
  readonly minutes: number;
  readonly hard: boolean;
  readonly steps: Step[];
  readonly mantra: string;
  readonly notes: string;
  readonly video_url: string;
  readonly location: string;
  readonly recurrence: Recurrence | null;
  readonly never_shrink: boolean;
  readonly smaller_versions: SmallerVersion;
}

/** Validates a whole task form. `previousSmaller` keeps fields the form doesn't edit. */
export function validateTaskDraft(
  draft: TaskDraft,
  newId: () => string,
  previousSmaller: SmallerVersion = {},
): ValidTaskFields {
  const name = requireName(draft.name, LIMITS.name);
  const minutes = requireMinutes(draft.minutes);
  const smallerMinutes =
    draft.smaller.minutes === null ? null : requireMinutes(draft.smaller.minutes);
  const smallerText = clampText(draft.smaller.text, LIMITS.notes);
  const smaller: SmallerVersion = { ...previousSmaller };
  delete smaller.minutes;
  delete smaller.text;
  if (smallerMinutes !== null) smaller.minutes = smallerMinutes;
  if (smallerText !== "") smaller.text = smallerText;
  return {
    name,
    emoji: normaliseEmoji(draft.emoji, name),
    minutes,
    hard: draft.hard,
    steps: normaliseSteps(draft.steps, newId),
    mantra: clampText(draft.mantra, LIMITS.mantra),
    notes: clampText(draft.notes, LIMITS.notes),
    video_url: requireVideoUrl(draft.videoUrl),
    location: clampText(draft.location, LIMITS.location),
    recurrence: requireRecurrence(draft.recurrence),
    never_shrink: draft.neverShrink,
    smaller_versions: smaller,
  };
}
