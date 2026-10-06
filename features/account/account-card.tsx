"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ErrorCodeTag } from "@/components/errors/error-code-tag";
import { useKv } from "@/data/hooks/use-kv";
import { useSession } from "@/data/remote/session";
import type { PageId } from "@/lib/errors/pages";

/** Settings → Account (handoff screen 15): sign-in invite, or who is signed in. */
export function AccountCard({ pageId }: { pageId: PageId }) {
  const session = useSession();
  const owner = useKv("sync_owner");

  if (session.status === "loading") {
    return (
      <div
        aria-busy="true"
        className="mt-2.5 h-[74px] rounded-[18px] border border-border bg-surface"
      />
    );
  }
  if (session.status === "unconfigured") {
    return (
      <div className="mt-2.5 rounded-[18px] border border-border bg-surface p-4">
        <p className="text-[14px] font-semibold text-ink">
          Accounts aren&apos;t set up in this build
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-text-muted">
          Your day works fully on this phone. Backing it up to an account isn&apos;t available here.
        </p>
        <div className="mt-2">
          <ErrorCodeTag code="RR-AUTH-008" pageId={pageId} />
        </div>
      </div>
    );
  }
  if (session.status === "signed-out") {
    return (
      <div className="mt-2.5 rounded-[18px] border border-tint-border bg-surface p-4">
        <p className="text-[14px] font-semibold text-ink">No account yet</p>
        <p className="mt-[5px] text-[12.5px] leading-[1.55] text-text-muted">
          Everything is on this phone only. An account saves your Day Plans, tasks and log so they
          come back on a new phone.
        </p>
        <Link
          href="/auth/"
          className="mt-3.5 flex min-h-12 items-center justify-center rounded-chip bg-primary px-4 text-[14px] font-bold text-white"
        >
          Sign in or create an account
        </Link>
      </div>
    );
  }
  const { user } = session;
  const linked = owner === user.id;
  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
  return (
    <Link
      href="/account/"
      className="mt-2.5 flex items-center gap-3 rounded-[18px] border border-border bg-surface p-[15px]"
    >
      <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-primary font-display text-[17px] font-bold text-white">
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-ink">
          {user.name || "You"}
        </span>
        <span
          className={`mt-[3px] block truncate text-[12px] font-medium ${linked ? "text-text-muted" : "text-primary-dark"}`}
        >
          {linked ? user.email : "Finish setting up your backup"}
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-text-faint" aria-hidden />
    </Link>
  );
}
