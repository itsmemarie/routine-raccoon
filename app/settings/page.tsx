import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsScreen } from "@/features/settings";

export const metadata: Metadata = { title: "Settings" };

/** P06 · Settings. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}
