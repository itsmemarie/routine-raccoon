"use client";

import { ConfirmDialog } from "@/components/ui/confirm";
import { defaultContext } from "@/data/commands/context";
import { deleteTask, removeTaskFromPlan } from "@/data/commands/tasks";
import type { TaskPlacement } from "@/domain/organise";
import type { Task } from "@/domain/types";
import type { PageId } from "@/lib/errors/pages";
import { useRun } from "./use-run";

const SINGLE_PLAN_BODY =
  "The task and its steps are removed for good. You can skip it for today instead.";

const names = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/**
 * Delete confirm for a task (handoff screen 9, "Deleting a task that's in several plans"). A task
 * in one plan gets the plain confirm. A task in several asks where: only the plan you're in, or
 * all of them. `onStart` fires once a choice is made, `onFinish` when the command has settled.
 */
export function DeleteTaskDialog({
  pageId,
  task,
  placement,
  onCancel,
  onStart,
  onFinish,
}: {
  pageId: PageId;
  task: Pick<Task, "id" | "name">;
  placement: TaskPlacement;
  onCancel: () => void;
  onStart: () => void;
  onFinish: (ok: boolean) => void;
}) {
  const run = useRun(pageId);
  const { current, plans } = placement;

  const deleteEverywhere = (success: string) => {
    onStart();
    void run(deleteTask(defaultContext(), { taskId: task.id }), { success }).then((result) =>
      onFinish(result.ok),
    );
  };

  if (!current || plans.length < 2) {
    return (
      <ConfirmDialog
        title={`Delete “${task.name}”?`}
        body={SINGLE_PLAN_BODY}
        confirmLabel="Delete task"
        onCancel={onCancel}
        onConfirm={() => deleteEverywhere(`Deleted ${task.name}`)}
      />
    );
  }

  const both = plans.length === 2;
  return (
    <ConfirmDialog
      title={`Delete “${task.name}”?`}
      body={`It's in ${names.format(plans.map((p) => p.name))}. Deleting it from ${both ? "both" : "all of them"} removes it and its steps for good. You can skip it for today instead.`}
      confirmLabel={`Only from ${current.name}`}
      alternative={{
        label: both ? "From both plans" : `From all ${plans.length} plans`,
        onSelect: () => deleteEverywhere(`Deleted ${task.name} from ${plans.length} plans`),
      }}
      onCancel={onCancel}
      onConfirm={() => {
        onStart();
        void run(removeTaskFromPlan(defaultContext(), { taskId: task.id, planId: current.id }), {
          success: `Removed ${task.name} from ${current.name}`,
        }).then((result) => onFinish(result.ok));
      }}
    />
  );
}
