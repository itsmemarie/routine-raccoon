import type { Metadata } from "next";
import { Suspense } from "react";
import { SectionFormScreen } from "@/features/section-form";

export const metadata: Metadata = { title: "Section" };

/** P04 · Add / edit section. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function SectionFormPage() {
  return (
    <Suspense>
      <SectionFormScreen />
    </Suspense>
  );
}
