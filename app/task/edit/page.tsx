import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskFormScreen } from "@/features/task-form";

export const metadata: Metadata = { title: "Task" };

/** P03 · New / edit task. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function TaskFormPage() {
  return (
    <Suspense>
      <TaskFormScreen />
    </Suspense>
  );
}
