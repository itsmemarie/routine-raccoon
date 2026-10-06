"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceChip } from "@/components/ui/chip";
import { GroupHeading } from "@/components/ui/layout";
import { Sheet } from "@/components/ui/sheet";
import { defaultContext } from "@/data/commands/context";
import { linkSectionToPlan, moveSectionToPlan } from "@/data/commands/sections";
import { copyTaskToPlan, moveTask } from "@/data/commands/tasks";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { activePlans, allSectionChoices, plansOfSection } from "@/domain/organise";
import type { PageId } from "@/lib/errors/pages";
import { useRun } from "./use-run";

export type CopyMoveTarget =
  | { readonly kind: "task"; readonly taskId: string; readonly sectionId: string }
  | { readonly kind: "section-copy"; readonly sectionId: string; readonly name: string }
  | {
      readonly kind: "section-move";
      readonly sectionId: string;
      readonly name: string;
      readonly fromPlanId: string;
    };

/**
 * Copy / move sheet (handoff screen 8, "Copy / move sheet").
 * - Task: Day Plans chips copy it into that plan's first section; section chips move it.
 * - Section copy: links the same section into another plan (decision Q1: link).
 * - Section move: leaves its current plan for another one.
 */
export function CopyMoveSheet({
  target,
  pageId,
  onClose,
}: {
  target: CopyMoveTarget;
  pageId: PageId;
  onClose: () => void;
}) {
  const org = useOrganisation();
  const run = useRun(pageId);
  if (!org) return null;

  const plans = activePlans(org);
  const linked = new Set(plansOfSection(org, target.sectionId).map((p) => p.id));

  const copy =
    target.kind === "task"
      ? {
          title: "Copy this task",
          description: "Pick a Day Plan to copy it into, or a section to move it to.",
          plans,
        }
      : target.kind === "section-copy"
        ? {
            title: "Copy this section",
            description:
              "It becomes the same section in both Day Plans, so an edit shows in each. Use Duplicate for a separate copy.",
            plans: plans.filter((p) => !linked.has(p.id)),
          }
        : {
            title: "Move this section",
            description:
              "It leaves this Day Plan and keeps its tasks, start time, colour and recurrence.",
            plans: plans.filter((p) => p.id !== target.fromPlanId && !linked.has(p.id)),
          };

  const pickPlan = async (planId: string) => {
    const ctx = defaultContext();
    if (target.kind === "task") {
      const result = await run(copyTaskToPlan(ctx, { taskId: target.taskId, planId }), {
        success: (v) => `Copied to ${v.planName}`,
      });
      if (result.ok) onClose();
    } else if (target.kind === "section-copy") {
      const result = await run(linkSectionToPlan(ctx, { sectionId: target.sectionId, planId }), {
        success: (v) =>
          v.alreadyThere
            ? `${target.name} is already in ${v.planName}`
            : `${target.name} copied to ${v.planName}`,
      });
      if (result.ok) onClose();
    } else {
      const result = await run(
        moveSectionToPlan(ctx, {
          sectionId: target.sectionId,
          fromPlanId: target.fromPlanId,
          toPlanId: planId,
        }),
        { success: (v) => `${target.name} moved to ${v.planName}` },
      );
      if (result.ok) onClose();
    }
  };

  const moveTo = async (sectionId: string, label: string) => {
    if (target.kind !== "task") return;
    const result = await run(
      moveTask(defaultContext(), { taskId: target.taskId, sectionId, via: "sheet" }),
      { success: `Moved to ${label}` },
    );
    if (result.ok) onClose();
  };

  const sectionChoices =
    target.kind === "task"
      ? allSectionChoices(org).filter((c) => c.section.id !== target.sectionId)
      : [];

  return (
    <Sheet
      title={copy.title}
      description={copy.description}
      onClose={onClose}
      testId="copy-move-sheet"
      footer={
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div>
        <GroupHeading as="h3">Day Plans</GroupHeading>
        {copy.plans.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-[7px]">
            {copy.plans.map((plan) => (
              <ChoiceChip key={plan.id} onClick={() => void pickPlan(plan.id)}>
                {plan.name}
              </ChoiceChip>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-text-muted">No other Day Plan to pick.</p>
        )}
      </div>
      {target.kind === "task" ? (
        <div>
          <GroupHeading as="h3">Move to a section</GroupHeading>
          <div className="mt-2.5 flex flex-wrap gap-[7px]">
            {sectionChoices.map((choice) => (
              <ChoiceChip
                key={`${choice.plan.id}:${choice.section.id}`}
                dot={choice.section.color}
                onClick={() => void moveTo(choice.section.id, choice.section.name)}
              >
                {choice.section.name} · {choice.plan.name}
              </ChoiceChip>
            ))}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Open/close state for the sheet: `open(target)` and the `sheet` element to render. */
export function useCopyMove(pageId: PageId) {
  const [target, setTarget] = useState<CopyMoveTarget | null>(null);
  return {
    open: setTarget,
    sheet: target ? (
      <CopyMoveSheet target={target} pageId={pageId} onClose={() => setTarget(null)} />
    ) : null,
  };
}
