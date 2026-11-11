import type { Step, Task } from "./types";

/**
 * Coupled tasks: separate rows (one per place) that share a `link_id`. They share their content,
 * so an edit to one reaches them all, but each keeps its own place, order, plan removals and
 * ticks. Pure; the commands write what these functions return.
 * @see docs/handoff/README.md "Coupling"
 */

/** The content a coupled copy shares. Everything else (place, order, survival level) is its own. */
export const LINKED_TASK_FIELDS = [
  "name",
  "emoji",
  "minutes",
  "hard",
  "never_shrink",
  "recurrence",
  "mantra",
  "notes",
  "video_url",
  "location",
  "steps",
  "smaller_versions",
] as const satisfies readonly (keyof Task)[];

export type LinkedField = (typeof LINKED_TASK_FIELDS)[number];
export type LinkedContent = Pick<Task, LinkedField>;

/** The other live copies coupled with `task` (archived ones included: they come back as they are). */
export function linkedCopies<T extends Pick<Task, "id" | "link_id" | "deleted_at">>(
  tasks: readonly T[],
  task: Pick<Task, "id" | "link_id">,
): T[] {
  if (task.link_id === null) return [];
  return tasks.filter(
    (t) => t.id !== task.id && t.link_id === task.link_id && t.deleted_at === null,
  );
}

/**
 * Steps of `source`, keeping `own` step ids by position: a copy's ticked steps
 * (`checked_step_ids`) must stay its own, and position is what both copies show.
 */
function stepsByPosition(
  source: readonly Step[],
  own: readonly Step[] | undefined,
  newId: () => string,
): Step[] {
  return source.map((step, i) => ({ id: own?.[i]?.id ?? newId(), text: step.text }));
}

/** What `member` becomes to match `source`'s content. */
export function linkedPatch(
  source: LinkedContent,
  member: LinkedContent,
  newId: () => string,
): LinkedContent {
  const { steps: smallerSteps, ...smaller } = source.smaller_versions;
  return {
    name: source.name,
    emoji: source.emoji,
    minutes: source.minutes,
    hard: source.hard,
    never_shrink: source.never_shrink,
    recurrence: source.recurrence === null ? null : structuredClone(source.recurrence),
    mantra: source.mantra,
    notes: source.notes,
    video_url: source.video_url,
    location: source.location,
    steps: stepsByPosition(source.steps, member.steps, newId),
    smaller_versions: {
      ...smaller,
      ...(smallerSteps === undefined
        ? {}
        : { steps: stepsByPosition(smallerSteps, member.smaller_versions.steps, newId) }),
    },
  };
}

/** Content with step ids left out: two copies match when this is equal. */
function comparable(task: LinkedContent): string {
  const texts = (steps: readonly Step[] | undefined) => steps?.map((s) => s.text);
  return JSON.stringify(
    LINKED_TASK_FIELDS.map((field) =>
      field === "steps"
        ? texts(task.steps)
        : field === "smaller_versions"
          ? { ...task.smaller_versions, steps: texts(task.smaller_versions.steps) }
          : task[field],
    ),
  );
}

export function sameLinkedContent(a: LinkedContent, b: LinkedContent): boolean {
  return comparable(a) === comparable(b);
}

/**
 * Two devices can edit two copies before either syncs, and last-write-wins works per row, so the
 * copies can end up apart. The most recently edited copy wins; returns the patches that bring the
 * others in line (none when they already match).
 */
export function reconcileGroup<T extends LinkedContent & Pick<Task, "id" | "updated_at">>(
  members: readonly T[],
  newId: () => string,
): { id: string; patch: LinkedContent }[] {
  if (members.length < 2) return [];
  // Parsed, not string-compared: the server writes "+00:00" offsets, the app "Z".
  const at = (t: T) => Date.parse(t.updated_at) || 0;
  const winner = members.reduce((a, b) => (at(b) > at(a) ? b : a));
  return members
    .filter((m) => m.id !== winner.id && !sameLinkedContent(m, winner))
    .map((m) => ({ id: m.id, patch: linkedPatch(winner, m, newId) }));
}
