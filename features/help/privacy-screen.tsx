"use client";

import { ScreenHeader, ScreenRoot } from "@/components/ui/screen";

const PAGE = "P12" as const;

/** Privacy (P12). Copy rewritten per the handoff "Prototype vs spec" table. */
export function PrivacyScreen() {
  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <ScreenHeader title="Privacy" fallback="/settings/" />
      <div className="flex flex-col gap-3 px-3.5 text-[13.5px] leading-relaxed text-ink-muted">
        <p>
          <strong className="text-ink">Your routine lives on this phone.</strong> Routine Raccoon
          works fully without an account.
        </p>
        <p>
          If you create an account, a copy of your routine is saved to our server so you can restore
          it on another phone. Only you can read it.
        </p>
        <p>Nothing is shared, sold or used for ads. There is no tracking.</p>
        <p>
          When something breaks, the app sends an error report with a code and technical details. It
          never includes your task names, notes or email.
        </p>
        <p>
          You can export everything, or delete your account and its saved copy, at any time from
          Settings.
        </p>
      </div>
    </ScreenRoot>
  );
}
