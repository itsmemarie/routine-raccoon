import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchiveScreen } from "@/features/archive";

export const metadata: Metadata = { title: "Archive" };

/** P09 · Archive. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveScreen />
    </Suspense>
  );
}
