"use client";

import { ArrowDown, ArrowUp, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyBox, GroupHeading } from "@/components/ui/layout";
import { useBack } from "@/components/ui/navigation";
import { BackBar, ScreenRoot } from "@/components/ui/screen";
import { neighbourMove, SortableList } from "@/components/ui/sortable-list";
import { defaultContext } from "@/data/commands/context";
import { reorderSection, restoreSection } from "@/data/commands/sections";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { sectionLengthLabel } from "@/domain/log";
import { archivedSections, sectionRows, type SectionRow } from "@/domain/organise";
import { recurrenceLabel } from "@/domain/recurrence";
import { AppError } from "@/lib/errors/app-error";
import { useRun, useSectionActions, type SectionAction } from "@/features/common";

const PAGE = "P05" as const;

/** Sections manager (P05, handoff screen 14): reorder, and per-section actions, for one plan. */
export function SectionsScreen() {
  const params = useSearchParams();
  const planId = params.get("plan");
  if (!planId) throw new AppError("RR-APP-004", { context: { param: "plan", pageId: PAGE } });
  return <Sections planId={planId} />;
}

function Sections({ planId }: { planId: string }) {
  const org = useOrganisation();
  const run = useRun(PAGE);
  const back = useBack("/settings/");
  const actions = useSectionActions(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!org) return <ScreenRoot pageId={PAGE} />;
  const plan = org.plans.find((p) => p.id === planId && p.deleted_at === null);
  if (!plan) throw new AppError("RR-DB-005", { context: { entity: "day_plan", pageId: PAGE } });

  const rows = sectionRows(org, plan.id).map((row) => ({ ...row, id: row.section.id }));
  const archived = archivedSections(org).filter((a) => a.planNames.includes(plan.name));
  const reorder = (sectionId: string, afterSectionId: string | null) =>
    void run(reorderSection(defaultContext(), { planId: plan.id, sectionId, afterSectionId }));

  const actionButton = (
    label: string,
    action: SectionAction,
    row: SectionRow,
    destructive = false,
  ) => (
    <button
      key={action}
      type="button"
      onClick={() => actions.perform(action, row.section, plan)}
      className={`min-h-10 rounded-[11px] px-3 text-[12px] ${destructive ? "bg-destructive-bg font-bold text-destructive" : "bg-screen font-semibold text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <BackBar
        backLabel="Settings"
        title="Sections"
        fallback="/settings/"
        action={
          <button
            type="button"
            onClick={back}
            className="min-h-11 px-1 text-[13px] font-bold text-primary"
          >
            Done
          </button>
        }
      />
      <div className="px-3.5 pt-3.5">
        <div className="flex items-center gap-[11px] rounded-[18px] bg-ink px-[15px] py-3.5">
          <span aria-hidden className="size-[9px] shrink-0 rounded-[3px] bg-amber" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-medium tracking-[0.14em] text-text-on-dark uppercase">
              Sections in
            </span>
            <span className="mt-[3px] block truncate text-[15px] font-bold text-white">
              {plan.name}
            </span>
          </span>
          {plan.kind === "survival" ? (
            <span className="shrink-0 rounded-[5px] bg-primary-mid px-[7px] py-[3px] text-[9.5px] font-bold tracking-[0.07em] text-white uppercase">
              {org.settings.survivalName}
            </span>
          ) : null}
        </div>
        <p className="mt-[11px] text-[11.5px] leading-normal text-text-muted">
          Drag a section to reorder it. Tap one for its actions. Each section keeps its own start
          time and recurrence.
        </p>

        <div className="mt-3.5">
          {rows.length === 0 ? (
            <EmptyBox>No sections in this Day Plan yet</EmptyBox>
          ) : (
            <SortableList
              items={rows}
              label={`Sections in ${plan.name}`}
              nameOf={(row) => row.section.name}
              onReorder={reorder}
              render={(row, { handle, dragging, index }) => {
                const open = expanded === row.section.id;
                const up = neighbourMove(rows, index, -1);
                const down = neighbourMove(rows, index, 1);
                const meta = [
                  row.section.start_time,
                  recurrenceLabel(row.section.recurrence),
                  `${row.taskCount} ${row.taskCount === 1 ? "task" : "tasks"}`,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    data-testid="section-row"
                    className={`rounded-[18px] border bg-surface px-[15px] py-3.5 ${dragging ? "rotate-[-0.8deg] border-primary shadow-drag" : "border-border"}`}
                  >
                    <div className="flex items-start gap-[11px]">
                      {handle}
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : row.section.id)}
                        className="flex min-w-0 flex-1 items-start gap-[11px] text-left"
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 size-[9px] shrink-0 rounded-[3px]"
                          style={{ background: row.section.color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-ink">
                            {row.section.name}
                          </span>
                          {row.section.description ? (
                            <span className="mt-1 block text-[12px] leading-[1.45] text-text-muted">
                              {row.section.description}
                            </span>
                          ) : null}
                          <span className="mt-[5px] flex items-center gap-1.5 text-[11.5px] font-medium text-text-faint">
                            <Clock size={12} strokeWidth={1.7} aria-hidden />
                            {meta}
                          </span>
                          <span className="mt-1 block text-[11.5px] font-semibold text-text-muted">
                            {sectionLengthLabel(
                              row.section.length_override_minutes,
                              row.minutesFromTasks,
                            )}
                            {row.alsoIn.length > 0
                              ? ` · also in ${row.alsoIn.map((p) => p.name).join(", ")}`
                              : ""}
                          </span>
                        </span>
                      </button>
                      <span className="flex shrink-0 flex-col gap-[5px]">
                        <button
                          type="button"
                          aria-label={`Move ${row.section.name} up`}
                          disabled={up === undefined}
                          onClick={() => up !== undefined && reorder(row.section.id, up)}
                          className="flex size-[34px] items-center justify-center rounded-[11px] bg-canvas text-ink disabled:opacity-35"
                        >
                          <ArrowUp size={14} strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row.section.name} down`}
                          disabled={down === undefined}
                          onClick={() => down !== undefined && reorder(row.section.id, down)}
                          className="flex size-[34px] items-center justify-center rounded-[11px] bg-canvas text-ink disabled:opacity-35"
                        >
                          <ArrowDown size={14} strokeWidth={2} aria-hidden />
                        </button>
                      </span>
                    </div>
                    {open ? (
                      <div className="mt-[13px] flex flex-wrap gap-[7px] border-t border-border pt-[13px]">
                        {actionButton("Edit", "edit", row)}
                        {actionButton("Duplicate", "duplicate", row)}
                        {actionButton("Copy to Day Plan", "copy", row)}
                        {actionButton("Move to Day Plan", "move", row)}
                        {row.alsoIn.length > 0
                          ? actionButton("Remove from this Day Plan", "remove", row)
                          : null}
                        {actionButton("Archive", "archive", row)}
                        {actionButton("Delete", "delete", row, true)}
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
          )}
          <Link
            href={`/section/edit/?plan=${encodeURIComponent(plan.id)}`}
            className="mt-[9px] flex min-h-12 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border-strong text-[13px] font-semibold text-text-muted"
          >
            <Plus size={12} strokeWidth={2.4} aria-hidden /> New section
          </Link>
        </div>

        {archived.length > 0 ? (
          <section aria-labelledby="archived-sections" className="mt-[22px]">
            <GroupHeading id="archived-sections">Archived sections</GroupHeading>
            <ul className="mt-2.5 overflow-hidden rounded-[18px] border border-border bg-surface">
              {archived.map(({ section }) => (
                <li
                  key={section.id}
                  className="flex items-center gap-[11px] border-b border-border px-[15px] py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-text-muted">
                    {section.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void run(restoreSection(defaultContext(), { sectionId: section.id }), {
                        success: `${section.name} restored`,
                      })
                    }
                    className="min-h-11 shrink-0 px-1 text-[12px] font-semibold text-primary"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      {actions.dialogs}
    </ScreenRoot>
  );
}
