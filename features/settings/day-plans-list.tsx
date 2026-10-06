"use client";

import { ArrowDown, ArrowUp, ListTree, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { ConfirmDialog, PromptDialog } from "@/components/ui/confirm";
import { neighbourMove, SortableList } from "@/components/ui/sortable-list";
import { defaultContext } from "@/data/commands/context";
import {
  archivePlan,
  createPlan,
  deletePlan,
  duplicatePlan,
  makePrimary,
  renamePlan,
  reorderPlan,
  setPlanDescription,
  setSurvivalMembership,
} from "@/data/commands/plans";
import type { OrganisationSnapshot } from "@/data/hooks/use-organisation";
import { archivedPlans, archivedSections, planCards, type PlanCard } from "@/domain/organise";
import type { DayPlan } from "@/domain/types";
import type { AppError } from "@/lib/errors/app-error";
import { useRun } from "@/features/common";

const PAGE = "P06" as const;

type Prompt =
  { kind: "rename"; plan: DayPlan } | { kind: "description"; plan: DayPlan } | { kind: "new" };

const pill = "flex min-h-10 items-center gap-[7px] rounded-[11px] px-3 text-[12px]";

/** Settings → Day Plans (handoff "Day Plans (Settings)"). */
export function DayPlansList({ org }: { org: OrganisationSnapshot }) {
  const router = useRouter();
  const run = useRun(PAGE);
  const [more, setMore] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [promptError, setPromptError] = useState<AppError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DayPlan | null>(null);
  const ctx = () => defaultContext();
  const survivalName = org.settings.survivalName;
  const cards = planCards(org).map((c) => ({ ...c, id: c.plan.id }));
  const archivedCount = archivedPlans(org).length + archivedSections(org).length;

  const reorder = (planId: string, afterPlanId: string | null) =>
    void run(reorderPlan(ctx(), { planId, afterPlanId }));

  const openPrompt = (next: Prompt) => {
    setPromptError(null);
    setPrompt(next);
  };

  const submitPrompt = async (value: string) => {
    if (!prompt) return;
    const options = { onInputError: setPromptError };
    if (prompt.kind === "rename") {
      const r = await run(renamePlan(ctx(), { planId: prompt.plan.id, name: value }), options);
      if (r.ok) setPrompt(null);
    } else if (prompt.kind === "description") {
      const r = await run(
        setPlanDescription(ctx(), { planId: prompt.plan.id, description: value }),
        options,
      );
      if (r.ok) setPrompt(null);
    } else {
      const r = await run(createPlan(ctx(), { name: value }), {
        ...options,
        success: (v) => `Added ${v.name}`,
      });
      if (r.ok) {
        setPrompt(null);
        router.push(`/plans/sections/?plan=${encodeURIComponent(r.value.planId)}`);
      }
    }
  };

  const renderCard = (card: PlanCard, handle: ReactNode, dragging: boolean, index: number) => {
    const { plan } = card;
    const open = more === plan.id;
    const up = neighbourMove(cards, index, -1);
    const down = neighbourMove(cards, index, 1);
    return (
      <div
        data-testid="plan-card"
        className={`rounded-[18px] border bg-surface px-[15px] py-3.5 ${dragging ? "rotate-[-0.8deg] border-primary shadow-drag" : "border-border"}`}
      >
        <div className="flex items-start gap-[11px]">
          {handle}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-[7px]">
              <span className="text-[15px] font-semibold text-ink">{plan.name}</span>
              {plan.kind === "survival" ? (
                <span className="rounded-[5px] bg-primary-mid px-[7px] py-[3px] text-[9.5px] font-bold tracking-[0.07em] text-white uppercase">
                  {survivalName}
                </span>
              ) : null}
              {plan.kind === "primary" ? (
                <span className="rounded-[5px] bg-ink px-[7px] py-[3px] text-[9.5px] font-bold tracking-[0.07em] text-white uppercase">
                  Primary
                </span>
              ) : null}
            </span>
            {plan.description ? (
              <span className="mt-[5px] block text-[12px] leading-[1.45] text-text-muted">
                {plan.description}
              </span>
            ) : null}
            <span className="mt-[5px] block text-[11.5px] font-medium text-text-faint">
              {card.sectionCount} {card.sectionCount === 1 ? "section" : "sections"} ·{" "}
              {card.taskCount} {card.taskCount === 1 ? "task" : "tasks"}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-[5px]">
            {plan.kind === "custom" ? (
              <button
                type="button"
                onClick={() =>
                  void run(makePrimary(ctx(), { planId: plan.id }), {
                    success: `${plan.name} is now primary`,
                  })
                }
                className="min-h-9 px-1 text-[11.5px] font-semibold text-text-muted"
              >
                Make primary
              </button>
            ) : null}
            <span className="flex gap-[5px]">
              <button
                type="button"
                aria-label={`Move ${plan.name} up`}
                disabled={up === undefined}
                onClick={() => up !== undefined && reorder(plan.id, up)}
                className="flex size-[34px] items-center justify-center rounded-[11px] bg-canvas text-ink disabled:opacity-35"
              >
                <ArrowUp size={14} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Move ${plan.name} down`}
                disabled={down === undefined}
                onClick={() => down !== undefined && reorder(plan.id, down)}
                className="flex size-[34px] items-center justify-center rounded-[11px] bg-canvas text-ink disabled:opacity-35"
              >
                <ArrowDown size={14} strokeWidth={2} aria-hidden />
              </button>
            </span>
          </span>
        </div>
        <div className="mt-[13px] flex flex-wrap gap-[7px] border-t border-border pt-[13px]">
          <Link
            href={`/plans/sections/?plan=${encodeURIComponent(plan.id)}`}
            aria-label={`Sections in ${plan.name}`}
            className={`${pill} bg-canvas font-semibold text-ink`}
          >
            <ListTree size={12} strokeWidth={1.7} aria-hidden /> Sections
          </Link>
          <button
            type="button"
            onClick={() => openPrompt({ kind: "rename", plan })}
            aria-label={`Rename ${plan.name}`}
            className={`${pill} bg-screen font-semibold text-ink`}
          >
            <Pencil size={12} strokeWidth={1.7} aria-hidden /> Rename
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`More for ${plan.name}`}
            onClick={() => setMore(open ? null : plan.id)}
            className={`${pill} font-semibold ${open ? "bg-ink text-white" : "bg-screen text-ink"}`}
          >
            <MoreHorizontal size={12} strokeWidth={1.7} aria-hidden /> More
          </button>
        </div>
        {open ? (
          <div className="mt-2 flex flex-wrap gap-[7px]">
            {plan.kind === "primary" ? null : (
              <button
                type="button"
                onClick={() =>
                  void run(
                    setSurvivalMembership(ctx(), { planId: plan.id, on: plan.kind !== "survival" }),
                    {
                      success:
                        plan.kind === "survival"
                          ? `${plan.name} is no longer a ${survivalName} plan`
                          : `${plan.name} is now a ${survivalName} plan`,
                    },
                  )
                }
                className={`${pill} bg-tint font-bold text-primary-dark`}
              >
                {plan.kind === "survival"
                  ? `Remove from ${survivalName}`
                  : `Add to ${survivalName}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => openPrompt({ kind: "description", plan })}
              className={`${pill} bg-screen font-semibold text-ink`}
            >
              Description
            </button>
            <button
              type="button"
              onClick={() =>
                void run(duplicatePlan(ctx(), { planId: plan.id }), {
                  success: `${plan.name} duplicated`,
                })
              }
              className={`${pill} bg-screen font-semibold text-ink`}
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() =>
                void run(archivePlan(ctx(), { planId: plan.id }), {
                  success: `${plan.name} archived`,
                })
              }
              className={`${pill} bg-screen font-semibold text-ink`}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() =>
                plan.kind === "primary"
                  ? void run(deletePlan(ctx(), { planId: plan.id }))
                  : setConfirmDelete(plan)
              }
              className={`${pill} bg-destructive-bg font-bold text-destructive`}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <SortableList
        items={cards}
        label="Day Plans"
        nameOf={(card) => card.plan.name}
        onReorder={reorder}
        className="mt-3 flex flex-col gap-[9px]"
        render={(card, { handle, dragging, index }) => renderCard(card, handle, dragging, index)}
      />
      <div className="mt-[9px] flex gap-[9px]">
        <button
          type="button"
          onClick={() => openPrompt({ kind: "new" })}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border-strong text-[13px] font-semibold text-text-muted"
        >
          <Plus size={12} strokeWidth={2.4} aria-hidden /> New Day Plan
        </button>
        <Link
          href="/archive/"
          className="flex min-h-12 shrink-0 items-center rounded-card bg-canvas px-4 text-[13px] font-semibold text-text-muted"
        >
          Archived · {archivedCount}
        </Link>
      </div>

      {prompt ? (
        <PromptDialog
          key={prompt.kind === "new" ? "new" : `${prompt.kind}:${prompt.plan.id}`}
          title={
            prompt.kind === "rename"
              ? "Rename Day Plan"
              : prompt.kind === "description"
                ? "Description"
                : "New Day Plan"
          }
          label={prompt.kind === "description" ? "Description" : "Day Plan name"}
          initialValue={
            prompt.kind === "rename"
              ? prompt.plan.name
              : prompt.kind === "description"
                ? prompt.plan.description
                : ""
          }
          multiline={prompt.kind === "description"}
          maxLength={prompt.kind === "description" ? 4000 : 80}
          placeholder={
            prompt.kind === "description"
              ? "What is this Day Plan for?"
              : "Travelling, Work from home…"
          }
          submitLabel={prompt.kind === "new" ? "Add Day Plan" : "Save"}
          error={promptError ? <InlineError error={promptError} pageId={PAGE} /> : undefined}
          onCancel={() => setPrompt(null)}
          onSubmit={(value) => void submitPrompt(value)}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${confirmDelete.name}”?`}
          body="The Day Plan and the sections only it uses are removed for good. Archiving keeps the history instead."
          confirmLabel="Delete Day Plan"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const plan = confirmDelete;
            setConfirmDelete(null);
            setMore(null);
            void run(deletePlan(ctx(), { planId: plan.id }), { success: `Deleted ${plan.name}` });
          }}
        />
      ) : null}
    </>
  );
}
