"use client";

import Link from "next/link";

/**
 * First-run card (PRD R12: the setup wizard "runs on first launch"). Shown while there are no
 * tasks at all; it invites rather than forces, because someone restoring from an account
 * shouldn't have to answer questions first.
 */
export function WelcomeCard({
  canRestore,
  onDismiss,
}: {
  canRestore: boolean;
  onDismiss: () => void;
}) {
  const action =
    "flex min-h-11 items-center justify-center rounded-chip px-4 text-[13.5px] font-bold";
  return (
    <section
      aria-labelledby="welcome-title"
      data-testid="welcome-card"
      className="mt-3 rounded-[20px] border border-tint-border bg-surface p-4"
    >
      <h2
        id="welcome-title"
        className="font-display text-[18px] leading-[1.15] font-bold tracking-[-0.02em] text-ink"
      >
        Let&apos;s build your day
      </h2>
      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-text-muted">
        Five questions turn the thing you keep avoiding into a small first step. Or add tasks
        yourself, or paste a list you already have.
      </p>
      <div className="mt-3.5 flex flex-col gap-2">
        <Link href="/setup/" className={`${action} bg-primary text-white shadow-primary`}>
          Answer five questions
        </Link>
        <Link href="/task/edit/?paste=1" className={`${action} bg-tint text-primary-dark`}>
          Paste a list
        </Link>
        {canRestore ? (
          <Link href="/auth/" className={`${action} bg-canvas text-ink`}>
            Restore from my account
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 text-[12.5px] font-semibold text-text-muted"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
