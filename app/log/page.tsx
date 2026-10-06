import type { Metadata } from "next";
import { Suspense } from "react";
import { LogScreen } from "@/features/log";

export const metadata: Metadata = { title: "Log" };

/** P08 · Log and task activity. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function LogPage() {
  return (
    <Suspense>
      <LogScreen />
    </Suspense>
  );
}
