"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { ErrorCodeTag } from "@/components/errors/error-code-tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { BackBar, ScreenRoot } from "@/components/ui/screen";
import { SettingsGroup, SettingsRow } from "@/components/ui/settings-row";
import { forgetAccount, logAccountEvent, retryQuarantined } from "@/data/commands/account";
import { defaultContext } from "@/data/commands/context";
import { useClock } from "@/data/hooks/use-day-key";
import { useKv } from "@/data/hooks/use-kv";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { deleteSavedCopy, signOut } from "@/data/remote/auth";
import { useSession } from "@/data/remote/session";
import { syncNow, useSyncStatus } from "@/data/sync/runtime";
import { formatRelative } from "@/domain/time";
import { AppError } from "@/lib/errors/app-error";
import { ExportSheet, showToast, useRun } from "@/features/common";
import { useLinkAccount } from "./use-link-account";

const PAGE = "P14" as const;

/** Account (P14, handoff screen 23). */
export function AccountScreen() {
  const router = useRouter();
  const run = useRun(PAGE);
  const session = useSession();
  const owner = useKv("sync_owner");
  const lastSynced = useKv("last_synced_at");
  const quarantine = useKv("sync_quarantine");
  const org = useOrganisation();
  const now = useClock(30_000);
  const status = useSyncStatus();
  const [confirm, setConfirm] = useState<"sign-out" | "delete" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const linking = useLinkAccount(
    PAGE,
    useCallback(() => undefined, []),
  );

  if (session.status === "unconfigured") {
    return (
      <ScreenRoot pageId={PAGE}>
        <BackBar backLabel="Settings" title="Account" fallback="/settings/" />
        <div className="px-3.5 pt-4">
          <InlineError error={new AppError("RR-AUTH-008")} pageId={PAGE} />
        </div>
      </ScreenRoot>
    );
  }
  if (session.status === "loading") return <ScreenRoot pageId={PAGE} />;
  if (session.status === "signed-out") {
    return (
      <ScreenRoot pageId={PAGE}>
        <BackBar backLabel="Settings" title="Account" fallback="/settings/" />
        <div className="px-3.5 pt-4">
          <div className="rounded-[18px] border border-border bg-surface p-4">
            <p className="text-[14px] font-semibold text-ink">You&apos;re signed out</p>
            <p className="mt-1 text-[12.5px] leading-[1.55] text-text-muted">
              Your day stays on this phone.
            </p>
            <Link
              href="/auth/"
              className="mt-3 flex min-h-12 items-center justify-center rounded-chip bg-primary text-[14px] font-bold text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </ScreenRoot>
    );
  }

  const { user } = session;
  const linked = owner === user.id;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  const refused = quarantine ?? [];

  const doSync = async () => {
    const result = await syncNow();
    if (result.ok) showToast("Everything is backed up");
  };

  const doSignOut = async () => {
    setBusy(true);
    const result = await run(signOut(), { success: "Signed out. Your day stays on this phone." });
    setBusy(false);
    if (result.ok) router.replace("/settings/");
  };

  const doDelete = async () => {
    setBusy(true);
    const ctx = defaultContext();
    const deleted = await run(deleteSavedCopy());
    if (!deleted.ok) return setBusy(false);
    await run(
      logAccountEvent(ctx, {
        event: "deleted",
        detail: `${user.email} · saved copy removed`,
        provider: user.provider,
      }),
    );
    await run(forgetAccount(ctx));
    await run(signOut(), { success: "Your saved copy is deleted. The day on this phone stays." });
    setBusy(false);
    router.replace("/settings/");
  };

  const backupLine =
    status.phase === "syncing"
      ? "Backing up…"
      : lastSynced && now
        ? `Day Plans, tasks and the full log, backed up ${formatRelative(lastSynced, now)}.`
        : "Day Plans, tasks and the full log are saved here once the first backup finishes.";

  return (
    <ScreenRoot pageId={PAGE} className="pb-12">
      <BackBar backLabel="Settings" title="Account" fallback="/settings/" />
      <div className="px-3.5 pt-4">
        <div className="flex items-center gap-[13px] rounded-[18px] border border-border bg-surface p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-display text-[19px] font-bold text-white">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
              {user.name || "You"}
            </span>
            <span className="mt-[3px] block truncate text-[12.5px] font-medium text-text-muted">
              {user.email}
            </span>
            <span className="mt-2 inline-block rounded-[5px] bg-canvas px-2 py-1 text-[9.5px] font-bold tracking-[0.07em] text-text-muted uppercase">
              {user.provider === "google" ? "Google account" : "Email and password"}
            </span>
          </span>
        </div>

        {linked ? (
          <div className="mt-3 rounded-[18px] border border-border bg-surface p-[15px]">
            <p className="flex items-center gap-[9px] text-[14px] font-semibold text-ink">
              <span
                aria-hidden
                className={`size-2 rounded-full ${status.phase === "error" ? "bg-amber" : "bg-success"}`}
              />
              {status.phase === "error" ? "Backup paused" : "Saved to your account"}
            </p>
            <p className="mt-[7px] text-[12.5px] leading-[1.55] text-text-muted" aria-live="polite">
              {status.phase === "error" ? "Your changes are safe on this phone." : backupLine}
            </p>
            {status.phase === "error" && status.error ? (
              <InlineError error={status.error} pageId={PAGE} className="mt-2.5" />
            ) : null}
            <Button
              variant="tertiary"
              className="mt-3 w-full"
              disabled={status.phase === "syncing"}
              onClick={() => void doSync()}
            >
              {status.phase === "syncing" ? "Backing up…" : "Sync now"}
            </Button>
          </div>
        ) : (
          <div className="mt-3 rounded-[18px] border border-tint-border bg-surface p-[15px]">
            <p className="text-[14px] font-semibold text-ink">Finish setting up your backup</p>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-text-muted">
              Link this phone&apos;s day to your account. If both already hold a day, you choose
              what to keep.
            </p>
            <Button
              className="mt-3 w-full"
              disabled={linking.busy}
              onClick={() => void linking.link(user, "signed-in")}
            >
              {linking.busy ? "Checking your account…" : "Back up this phone"}
            </Button>
          </div>
        )}

        {refused.length > 0 ? (
          <div className="mt-3 rounded-[18px] border border-tint-border bg-surface p-[15px]">
            <p className="text-[14px] font-semibold text-ink">
              {refused.length} {refused.length === 1 ? "change wasn't" : "changes weren't"} backed
              up
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.55] text-text-muted">
              The server refused them. They&apos;re still on this phone.
            </p>
            <div className="mt-1.5">
              <ErrorCodeTag code="RR-SYNC-003" pageId={PAGE} />
            </div>
            <Button
              variant="tint"
              className="mt-3 w-full"
              onClick={() =>
                void run(retryQuarantined(defaultContext()), { success: "Trying those again" })
              }
            >
              Try again
            </Button>
          </div>
        ) : null}

        <SettingsGroup className="mt-3">
          {user.provider === "email" ? (
            <SettingsRow
              title="Change password"
              description="We email you a code first"
              href={`/auth/?reset=${encodeURIComponent(user.email)}`}
            />
          ) : null}
          <SettingsRow
            title="Export all data"
            description="Take a copy with you at any time"
            value="Export"
            valueTone="accent"
            onClick={() => setExporting(true)}
          />
        </SettingsGroup>

        <div className="mt-3.5 flex flex-col gap-2">
          <Button variant="tertiary" disabled={busy} onClick={() => setConfirm("sign-out")}>
            Sign out
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => setConfirm("delete")}>
            Delete account
          </Button>
        </div>
        <p className="mt-3.5 text-center text-[11.5px] leading-[1.55] text-text-faint">
          Signing out leaves this phone&apos;s copy untouched.
        </p>
      </div>

      {confirm === "sign-out" ? (
        <ConfirmDialog
          title="Sign out?"
          body="Your day stays on this phone. Sign back in to keep saving it."
          confirmLabel="Sign out"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void doSignOut();
          }}
        />
      ) : null}
      {confirm === "delete" ? (
        <ConfirmDialog
          title="Delete your account?"
          body="The saved copy of your day is removed from the server for good. The day on this phone stays, and so does your sign-in for other apps."
          confirmLabel="Delete account"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void doDelete();
          }}
        />
      ) : null}
      {exporting ? (
        <ExportSheet
          pageId={PAGE}
          includesArchive={org?.settings.exportArchive ?? true}
          onClose={() => setExporting(false)}
        />
      ) : null}
      {linking.sheet}
    </ScreenRoot>
  );
}
