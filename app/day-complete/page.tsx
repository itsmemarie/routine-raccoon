import type { Metadata } from "next";
import { Suspense } from "react";
import { DayCompleteScreen } from "@/features/day-complete";

export const metadata: Metadata = { title: "Day complete" };

/** P10 · Day complete. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function DayCompletePage() {
  return (
    <Suspense>
      <DayCompleteScreen />
    </Suspense>
  );
}
