"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import type { PasteParseResult } from "@/domain/paste-parser";

function tasks(n: number): string {
  return `${n} ${n === 1 ? "task" : "tasks"}`;
}
function subtasks(n: number): string {
  return `${n} ${n === 1 ? "subtask" : "subtasks"}`;
}

/**
 * "Add {n} tasks?" (handoff screen 11, PRD R8): pasting 2+ lines into the name field asks
 * whether each line is a task or the first line is the task and the rest its subtasks.
 */
export function PasteDialog({
  parsed,
  onSeparate,
  onOne,
  onCancel,
}: {
  parsed: PasteParseResult;
  onSeparate: () => void;
  onOne: () => void;
  onCancel: () => void;
}) {
  const lines = parsed.lines.length;
  const separate = parsed.asSeparateTasks.length;
  const first = parsed.lines[0]?.text ?? "";
  return (
    <Dialog
      title={`Add ${tasks(separate)}?`}
      description={`You pasted ${lines} lines. Each line can be its own task, or the first line can be the task and the rest its subtasks.`}
      onClose={onCancel}
      testId="paste-dialog"
    >
      <p className="mt-3 truncate rounded-xl border border-border bg-screen px-3 py-2.5 text-[12.5px] font-medium text-ink">
        {first} …
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button onClick={onSeparate} className="min-h-12">
          Add {tasks(separate)}
        </Button>
        <Button variant="tint" onClick={onOne} className="min-h-12">
          Add 1 task with {subtasks(lines - 1)}
        </Button>
        <Button variant="tertiary" onClick={onCancel} className="bg-transparent text-text-muted">
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
