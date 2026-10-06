"use client";

import { useId, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/sheet";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";

/** The word the user types to confirm (case and surrounding spaces don't matter). */
export const DELETE_WORD = "DELETE";

/**
 * Delete account confirmation (P14). The login is shared with the owner's other apps, so this
 * spells out what goes and asks for a typed confirmation (TECH_SPEC §2.7). A stale session
 * (RR-AUTH-012) offers "Sign in again" instead of another try.
 */
export function DeleteAccountDialog({
  email,
  pageId,
  busy,
  error,
  onConfirm,
  onSignInAgain,
  onCancel,
}: {
  email: string;
  pageId: PageId;
  busy: boolean;
  error: AppError | null;
  onConfirm: () => void;
  onSignInAgain: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const confirmed = typed.trim().toUpperCase() === DELETE_WORD;
  const needsSignIn = error?.code === "RR-AUTH-012";

  return (
    <Dialog
      title="Delete your account?"
      onClose={busy ? () => undefined : onCancel}
      role="alertdialog"
      testId="delete-account"
    >
      <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-[1.55] text-ink-muted">
        <li>Your Routine Raccoon backup is deleted from the server.</li>
        <li>
          Your login, <span className="font-semibold text-ink">{email}</span>, is deleted. It&apos;s
          shared with your other apps: you won&apos;t be able to sign in to them with it, and their
          saved data may be deleted too.
        </li>
        <li>The day on this phone stays. Export it first if you want a copy.</li>
      </ul>
      <form
        className="mt-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmed && !busy && !needsSignIn) onConfirm();
        }}
      >
        <label htmlFor={inputId} className="text-[12.5px] font-semibold text-ink">
          Type {DELETE_WORD} to confirm
        </label>
        <input
          id={inputId}
          value={typed}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={busy}
          onChange={(event) => setTyped(event.target.value)}
          className="mt-1.5 w-full rounded-xl border-[1.5px] border-destructive bg-screen px-3.5 py-[13px] text-[14px] font-semibold tracking-[0.06em] text-ink outline-none"
        />
        {error ? <InlineError error={error} pageId={pageId} className="mt-2.5" /> : null}
        <div className="mt-3.5 flex flex-col gap-2">
          {needsSignIn ? (
            <Button type="button" onClick={onSignInAgain}>
              Sign in again
            </Button>
          ) : (
            <Button type="submit" variant="destructive" disabled={!confirmed || busy}>
              {busy ? "Deleting…" : "Delete account and login"}
            </Button>
          )}
          <Button type="button" variant="tertiary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
