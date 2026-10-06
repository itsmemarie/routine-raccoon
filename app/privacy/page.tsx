import type { Metadata } from "next";
import { Suspense } from "react";
import { PrivacyScreen } from "@/features/help";

export const metadata: Metadata = { title: "Privacy" };

/** P12 · Privacy. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function PrivacyPage() {
  return (
    <Suspense>
      <PrivacyScreen />
    </Suspense>
  );
}
