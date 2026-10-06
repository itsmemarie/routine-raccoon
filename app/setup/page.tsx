import type { Metadata } from "next";
import { Suspense } from "react";
import { SetupScreen } from "@/features/setup";

export const metadata: Metadata = { title: "Setup" };

/** P15 · Setup questions. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function SetupPage() {
  return (
    <Suspense>
      <SetupScreen />
    </Suspense>
  );
}
