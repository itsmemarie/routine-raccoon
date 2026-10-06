"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyBox, GroupHeading } from "@/components/ui/layout";
import { BackBar, ScreenRoot } from "@/components/ui/screen";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultContext } from "@/data/commands/context";
import { deletePlan, restorePlan } from "@/data/commands/plans";
import { deleteSection, restoreSection } from "@/data/commands/sections";
import { updateSettings } from "@/data/commands/settings";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { archivedPlans, archivedSections } from "@/domain/organise";
import { formatDayShort, localDayKey } from "@/domain/time";
import { useRun } from "@/features/common";

const PAGE = "P09" as const;

function archivedOn(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `archived ${formatDayShort(localDayKey(date))}`;
}

type Pending = { kind: "plan" | "section"; id: string; name: string } | null;

/** Archive (P09, handoff screen 19): archived Day Plans and sections, Restore / Delete for good. */
export function ArchiveScreen() {
  const org = useOrganisation();
  const run = useRun(PAGE);
  const [pending, setPending] = useState<Pending>(null);
  if (!org) return <ScreenRoot pageId={PAGE} />;
  const plans = archivedPlans(org);
  const sections = archivedSections(org);
  const ctx = () => defaultContext();

  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <BackBar backLabel="Settings" title="Archive" fallback="/settings/" />
      <div className="px-3.5 pt-3.5">
        <p className="text-[12.5px] leading-normal text-text-muted">
          Archived Day Plans and sections leave Today but keep their history, and stay in the Log
          and exports.
        </p>

        <GroupHeading className="mt-5">Day Plans</GroupHeading>
        {plans.length === 0 ? (
          <EmptyBox className="mt-2.5">No archived Day Plans</EmptyBox>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-[9px]">
            {plans.map(({ plan, sectionCount, taskCount }) => (
              <li
                key={plan.id}
                className="rounded-[18px] border border-border bg-surface px-[15px] py-3.5"
              >
                <div className="flex items-center gap-[11px]">
                  <span aria-hidden className="size-[9px] shrink-0 rounded-[3px] bg-text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-text-muted">
                      {plan.name}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] font-medium text-text-faint">
                      {[
                        archivedOn(plan.archived_at),
                        `${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`,
                        `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
                <div className="mt-[13px] flex gap-[7px] border-t border-border pt-[13px]">
                  <button
                    type="button"
                    aria-label={`Restore ${plan.name}`}
                    onClick={() =>
                      void run(restorePlan(ctx(), { planId: plan.id }), {
                        success: `${plan.name} restored`,
                      })
                    }
                    className="min-h-10 flex-1 rounded-[11px] bg-screen text-[12px] font-semibold text-ink"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${plan.name} for good`}
                    onClick={() => setPending({ kind: "plan", id: plan.id, name: plan.name })}
                    className="min-h-10 flex-1 rounded-[11px] bg-tint text-[12px] font-bold text-primary-dark"
                  >
                    Delete for good
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <GroupHeading className="mt-[22px]">Sections</GroupHeading>
        {sections.length === 0 ? (
          <EmptyBox className="mt-2.5">No archived sections</EmptyBox>
        ) : (
          <ul className="mt-2.5 overflow-hidden rounded-[18px] border border-border bg-surface">
            {sections.map(({ section, planNames }) => (
              <li
                key={section.id}
                className="flex items-center gap-2 border-b border-border px-[15px] py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text-muted">
                    {section.name}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] font-medium text-text-faint">
                    {[
                      planNames.length > 0 ? `From ${planNames.join(", ")}` : "",
                      archivedOn(section.archived_at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Restore ${section.name}`}
                  onClick={() =>
                    void run(restoreSection(ctx(), { sectionId: section.id }), {
                      success: `${section.name} restored`,
                    })
                  }
                  className="min-h-11 shrink-0 px-2 text-[12px] font-semibold text-primary"
                >
                  Restore
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${section.name} for good`}
                  onClick={() =>
                    setPending({ kind: "section", id: section.id, name: section.name })
                  }
                  className="min-h-11 shrink-0 px-2 text-[12px] font-semibold text-destructive"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-[18px] border border-border bg-surface">
          <SwitchRow
            id="export-archive"
            title="Export the archive too"
            description="Included in Export all data"
            checked={org.settings.exportArchive}
            onChange={(exportArchive) => void run(updateSettings(ctx(), { exportArchive }))}
          />
        </div>
      </div>
      {pending ? (
        <ConfirmDialog
          title={`Delete “${pending.name}” for good?`}
          body={
            pending.kind === "plan"
              ? "The Day Plan and the sections only it uses are removed, and leave future exports. This can't be undone."
              : "The section and its tasks are removed, and leave future exports. This can't be undone."
          }
          confirmLabel="Delete for good"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void run(
              target.kind === "plan"
                ? deletePlan(ctx(), { planId: target.id })
                : deleteSection(ctx(), { sectionId: target.id }),
              { success: `${target.name} deleted for good` },
            );
          }}
        />
      ) : null}
    </ScreenRoot>
  );
}
