import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressScreen } from "@/features/progress";

export const metadata: Metadata = { title: "Progress" };

/** P07 · Progress. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function ProgressPage() {
  return (
    <Suspense>
      <ProgressScreen />
    </Suspense>
  );
}
