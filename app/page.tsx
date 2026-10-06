import type { Metadata } from "next";
import { Suspense } from "react";
import { TodayScreen } from "@/features/today";

export const metadata: Metadata = { title: { absolute: "Today · Routine Raccoon" } };

/** P01 · Today. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function TodayPage() {
  return (
    <Suspense>
      <TodayScreen />
    </Suspense>
  );
}
