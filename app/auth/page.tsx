import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthScreen } from "@/features/account";

export const metadata: Metadata = { title: "Sign in" };

/** P13 · Sign in / sign up. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function AuthPage() {
  return (
    <Suspense>
      <AuthScreen />
    </Suspense>
  );
}
