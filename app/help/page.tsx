import type { Metadata } from "next";
import { Suspense } from "react";
import { HelpScreen } from "@/features/help";

export const metadata: Metadata = { title: "Help" };

/** P11 · Help. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function HelpPage() {
  return (
    <Suspense>
      <HelpScreen />
    </Suspense>
  );
}
