"use client";

import { Link2, Lock } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { GroupHeading } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/toggle";
import { useToastStore } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import {
  applySectionCoupling,
  applyTaskCoupling,
  revertCoupling,
  type CouplingUndo,
} from "@/data/commands/coupling";
import { useOrganisation } from "@/data/hooks/use-organisation";
import {
  sectionCouplingView,
  sectionStagedSummary,
  taskCouplingView,
  taskStagedSummary,
  type StagedSummary,
  type TaskPlace,
} from "@/domain/coupling";
import type { PageId } from "@/lib/errors/pages";
import { useRun } from "./use-run";

/** Same window as Today's tick and skip Undo. */
const UNDO_MS = 5000;

export type CouplingTarget =
  | { readonly kind: "task"; readonly taskId: string; readonly planId: string | null }
  | { readonly kind: "section"; readonly sectionId: string; readonly planId: string };

/**
 * Coupling sheet, "Where {name} lives" (handoff "Coupling"). One row per place the task or section
 * could live, with a switch. Changes are staged: nothing is written until the footer button, and
 * the line above it says what will happen, in full, before the user commits.
 * `staged`: rows to start toggled (the menu's "Decouple from other Day Plans" pre-stages them).
 */
export function CouplingSheet({
  target,
  pageId,
  staged: initial = [],
  onClose,
}: {
  target: CouplingTarget;
  pageId: PageId;
  staged?: readonly string[];
  onClose: () => void;
}) {
  const org = useOrganisation();
  const run = useRun(pageId);
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set(initial));
  const [explain, setExplain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  if (!org) return null;

  const toggle = (id: string) =>
    setStaged((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const undoToast = (message: string, undo: CouplingUndo | null) => {
    useToastStore.getState().show({
      message,
      durationMs: undo ? UNDO_MS : 2500,
      ...(undo
        ? {
            action: {
              label: "Undo",
              onPress: () =>
                void run(revertCoupling(defaultContext(), { undo }), { success: "Undone" }),
            },
          }
        : {}),
    });
  };

  let title: string;
  let description: string;
  let groups: { heading: string; rows: RowModel[] }[];
  let summary: StagedSummary;
  let apply: () => Promise<boolean>;

  if (target.kind === "task") {
    const task = org.tasks.find((t) => t.id === target.taskId && t.deleted_at === null);
    if (!task) return null;
    const view = taskCouplingView(org, task, target.planId);
    const toRow = (place: TaskPlace): RowModel => {
      const on = place.state.kind !== "off";
      const flipped = staged.has(place.id);
      const { state } = place;
      return {
        id: place.id,
        name: place.name,
        locked: state.kind === "through",
        on: state.kind === "through" ? true : flipped ? !on : on,
        changed: flipped && state.kind !== "through",
        detail:
          state.kind === "through"
            ? `Through the coupled section ${state.sectionName}`
            : state.kind === "coupled"
              ? place.scope === "plan"
                ? `Coupled · ${state.sectionName}`
                : "Coupled"
              : state.bringBack
                ? `Comes back to ${state.landing}`
                : place.scope === "plan"
                  ? `Would go to ${state.landing}`
                  : "Not here",
        explanation:
          state.kind === "through"
            ? `${task.name} shows in ${place.name} because its section ${state.sectionName} is coupled there. Decouple the section, or delete the task from ${place.name} only.`
            : null,
      };
    };
    const coupling = [...view.sections, ...view.plans].filter((p) => staged.has(p.id));
    const couple = coupling.filter((p) => p.state.kind === "off");
    const decouple = coupling.filter((p) => p.state.kind === "coupled");
    title = `Where ${task.name} lives`;
    description = "Coupled places share edits to this task. Ticks stay separate.";
    groups = [
      ...(view.sections.length > 0 && view.plan
        ? [{ heading: `Other sections in ${view.plan.name}`, rows: view.sections.map(toRow) }]
        : []),
      ...(view.plans.length > 0
        ? [{ heading: "Other Day Plans", rows: view.plans.map(toRow) }]
        : []),
    ];
    summary = taskStagedSummary(task.name, couple, decouple);
    apply = async () => {
      const result = await run(
        applyTaskCoupling(defaultContext(), {
          taskId: task.id,
          couple: {
            sectionIds: couple.filter((p) => p.scope === "section").map((p) => p.id),
            planIds: couple.filter((p) => p.scope === "plan").map((p) => p.id),
          },
          decouple: decouple.flatMap((p) => (p.state.kind === "coupled" ? [p.state.copyId] : [])),
          placeNames: { couple: couple.map((p) => p.name), decouple: decouple.map((p) => p.name) },
        }),
      );
      if (!result.ok) return false;
      undoToast(toastFor(task.name, couple, decouple), result.value.undo);
      return true;
    };
  } else {
    const section = org.sections.find((s) => s.id === target.sectionId && s.deleted_at === null);
    if (!section) return null;
    const view = sectionCouplingView(org, section, target.planId);
    const couple = view.plans.filter((p) => !p.coupled && staged.has(p.plan.id)).map((p) => p.plan);
    const decouple = view.plans
      .filter((p) => p.coupled && staged.has(p.plan.id))
      .map((p) => p.plan);
    title = `Where ${section.name} lives`;
    description =
      "A coupled section is the same section in each Day Plan: its tasks, edits and ticks are shared.";
    groups = [
      {
        heading: "Other Day Plans",
        rows: view.plans.map(({ plan, coupled }) => {
          const flipped = staged.has(plan.id);
          return {
            id: plan.id,
            name: plan.name,
            locked: false,
            on: flipped ? !coupled : coupled,
            changed: flipped,
            detail: coupled ? "Coupled" : "Not here",
            explanation: null,
          };
        }),
      },
    ];
    summary = sectionStagedSummary(section.name, couple, decouple);
    apply = async () => {
      const result = await run(
        applySectionCoupling(defaultContext(), {
          sectionId: section.id,
          planId: target.planId,
          couple: couple.map((p) => p.id),
          decouple: decouple.map((p) => p.id),
        }),
      );
      if (!result.ok) return false;
      undoToast(toastFor(section.name, couple, decouple), result.value.undo);
      return true;
    };
  }

  const nothing = summary.label === "";
  const commit = async () => {
    setBusy(true);
    const done = await apply();
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Sheet
      title={title}
      description={description}
      onClose={onClose}
      testId="coupling-sheet"
      footer={
        <div className="flex flex-col gap-2.5">
          {summary.lines.length > 0 ? (
            <div
              id={hintId}
              aria-live="polite"
              className={`rounded-card px-[13px] py-[11px] text-[12.5px] leading-normal ${summary.undoable ? "bg-tint text-ink" : "bg-destructive-bg text-ink"}`}
            >
              {summary.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <Button
            disabled={nothing || busy}
            aria-describedby={summary.lines.length > 0 ? hintId : undefined}
            onClick={() => void commit()}
          >
            {nothing ? "Turn a place on or off" : summary.label}
          </Button>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">There&apos;s nowhere else to couple it yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.heading}>
            <GroupHeading as="h3">{group.heading}</GroupHeading>
            <ul className="mt-1.5 divide-y divide-border">
              {group.rows.map((row) => (
                <PlaceRow
                  key={row.id}
                  row={row}
                  explaining={explain === row.id}
                  onToggle={() => toggle(row.id)}
                  onExplain={() => setExplain((open) => (open === row.id ? null : row.id))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </Sheet>
  );
}

interface RowModel {
  readonly id: string;
  readonly name: string;
  /** Shown through a coupled section: no switch here, an explanation instead. */
  readonly locked: boolean;
  readonly on: boolean;
  /** Staged, not yet saved. */
  readonly changed: boolean;
  readonly detail: string;
  readonly explanation: string | null;
}

function PlaceRow({
  row,
  explaining,
  onToggle,
  onExplain,
}: {
  row: RowModel;
  explaining: boolean;
  onToggle: () => void;
  onExplain: () => void;
}) {
  const labelId = useId();
  const detailId = useId();
  return (
    <li className="py-2.5">
      <div className="flex min-h-11 items-center gap-3">
        <span
          aria-hidden
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${row.on ? "bg-primary/10 text-primary" : "bg-canvas text-text-muted"}`}
        >
          {row.locked ? (
            <Lock size={13} strokeWidth={1.8} />
          ) : (
            <Link2 size={14} strokeWidth={1.8} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span id={labelId} className="block truncate text-[14px] font-semibold text-ink">
            {row.name}
          </span>
          <span id={detailId} className="block truncate text-[11.5px] font-medium text-text-muted">
            {row.changed ? (row.on ? "Will be coupled" : "Will be decoupled") : row.detail}
          </span>
        </span>
        {row.locked ? (
          <button
            type="button"
            onClick={onExplain}
            aria-expanded={explaining}
            className="min-h-11 shrink-0 px-2 text-[12.5px] font-bold text-primary"
          >
            Why?
          </button>
        ) : (
          <Switch
            checked={row.on}
            onChange={onToggle}
            aria-label={`Coupled in ${row.name}`}
            aria-describedby={detailId}
          />
        )}
      </div>
      {explaining && row.explanation ? (
        <p className="mt-1 ml-10 text-[12px] leading-normal text-text-muted">{row.explanation}</p>
      ) : null}
    </li>
  );
}

function toastFor(
  name: string,
  couple: readonly { name: string }[],
  decouple: readonly { name: string }[],
): string {
  const list = (xs: readonly { name: string }[]) =>
    new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(
      xs.map((x) => x.name),
    );
  if (decouple.length === 0) return `${name} coupled with ${list(couple)}`;
  if (couple.length === 0) return `${name} decoupled from ${list(decouple)}`;
  return `${name}: coupling saved`;
}

/** Open/close state for the sheet: `open(target, staged?)` and the `sheet` element to render. */
export function useCoupling(pageId: PageId) {
  const [state, setState] = useState<{
    target: CouplingTarget;
    staged: readonly string[];
  } | null>(null);
  return {
    open: (target: CouplingTarget, staged: readonly string[] = []) => setState({ target, staged }),
    sheet: state ? (
      <CouplingSheet
        target={state.target}
        staged={state.staged}
        pageId={pageId}
        onClose={() => setState(null)}
      />
    ) : null,
  };
}

/** The link glyph and count on a coupled task card or section header. Read-only. */
export function CoupledMark({ count, kind }: { count: number; kind: "task" | "section" }) {
  if (count <= 0) return null;
  const label =
    kind === "task"
      ? `Coupled with ${count} other ${count === 1 ? "place" : "places"}`
      : `Coupled with ${count} other Day ${count === 1 ? "Plan" : "Plans"}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center gap-[3px] text-[11px] font-semibold text-text-muted"
    >
      <Link2 aria-hidden size={12} strokeWidth={1.8} />
      {count}
    </span>
  );
}

/**
 * Above a coupled task's edit fields: an edit here goes everywhere. "Edit only here" decouples
 * this copy first (with Undo), so the next edit stays local.
 */
export function CoupledBanner({
  taskId,
  taskName,
  places,
  pageId,
}: {
  taskId: string;
  taskName: string;
  places: readonly string[];
  pageId: PageId;
}) {
  const run = useRun(pageId);
  if (places.length === 0) return null;
  const list = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(places);
  const editOnlyHere = async () => {
    const result = await run(applyTaskCoupling(defaultContext(), { taskId, decouple: [taskId] }));
    if (!result.ok) return;
    const { undo } = result.value;
    useToastStore.getState().show({
      message: `Edits to ${taskName} now stay here`,
      durationMs: UNDO_MS,
      action: {
        label: "Undo",
        onPress: () => void run(revertCoupling(defaultContext(), { undo }), { success: "Undone" }),
      },
    });
  };
  return (
    <div
      data-testid="coupled-banner"
      className="flex items-start gap-2.5 rounded-card bg-tint px-[13px] py-[11px]"
    >
      <Link2 aria-hidden size={15} strokeWidth={1.8} className="mt-[2px] shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-[12.5px] leading-normal text-ink">
        Edits here also update {taskName} in {list}.
      </p>
      <button
        type="button"
        onClick={() => void editOnlyHere()}
        className="-my-2 min-h-11 shrink-0 text-[12.5px] font-bold text-primary"
      >
        Edit only here
      </button>
    </div>
  );
}
