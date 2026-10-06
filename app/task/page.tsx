import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskDetailScreen } from "@/features/task-detail";

export const metadata: Metadata = { title: "Task" };

/** P02 · Task detail. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function TaskDetailPage() {
  return (
    <Suspense>
      <TaskDetailScreen />
    </Suspense>
  );
}
