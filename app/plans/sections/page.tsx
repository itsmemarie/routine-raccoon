import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionsScreen } from "@/features/sections";

export const metadata: Metadata = { title: "Sections" };

/** P05 · Sections manager. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function SectionsPage() {
  return (
    <Suspense>
      <SectionsScreen />
    </Suspense>
  );
}
