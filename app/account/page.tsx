import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountScreen } from "@/features/account";

export const metadata: Metadata = { title: "Account" };

/** P14 · Account. Routes stay thin: the screen lives in features/ (TECH_SPEC §1.2). */
export default function AccountPage() {
  return (
    <Suspense>
      <AccountScreen />
    </Suspense>
  );
}
