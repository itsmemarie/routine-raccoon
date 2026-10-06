"use client";

import { useCallback, useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toastError } from "@/components/ui/toast-store";
import type { AccountUser } from "@/data/remote/auth";
import { applyStrategy, planFirstSync, type MergeStrategy } from "@/data/sync/account";
import { getSyncDeps, syncNow } from "@/data/sync/runtime";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { reportError } from "@/lib/errors/report";
import { showToast } from "@/features/common";

type Event = "created" | "signed-in";

const OPTIONS: readonly {
  value: MergeStrategy;
  name: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    value: "merge",
    name: "Combine them",
    detail: "Nothing is lost: both days are kept, and their Day Plans are joined up.",
    recommended: true,
  },
  {
    value: "cloud",
    name: "Use the saved copy",
    detail: "This phone switches to the day saved in your account.",
  },
  {
    value: "phone",
    name: "Keep this phone's",
    detail: "The saved copy is replaced with what is on this phone.",
  },
];

const HOW: Record<MergeStrategy, string> = {
  merge: "copies combined",
  cloud: "saved copy restored",
  phone: "this phone's day kept",
};

/**
 * Links this phone to the signed-in account (handoff "Two copies of your day"). Asks only when
 * both the phone and the account already hold a day; otherwise picks the obvious way.
 */
export function useLinkAccount(pageId: PageId, onLinked: () => void) {
  const [ask, setAsk] = useState<{ account: AccountUser; event: Event; localTasks: number } | null>(
    null,
  );
  const [choice, setChoice] = useState<MergeStrategy>("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const fail = useCallback(
    (failure: AppError) => {
      const { errorId } = reportError(failure, { pageId });
      toastError(failure, pageId, errorId);
    },
    [pageId],
  );

  const runStrategy = useCallback(
    async (account: AccountUser, event: Event, strategy: MergeStrategy): Promise<boolean> => {
      const deps = getSyncDeps();
      if (!deps.ok) {
        fail(deps.error);
        return false;
      }
      setBusy(true);
      setError(null);
      const result = await applyStrategy(deps.value, account, strategy, event);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      showToast(
        event === "created"
          ? "Account created · your day is saved"
          : `Welcome back${account.name ? `, ${account.name}` : ""} · ${HOW[strategy]}`,
      );
      onLinked();
      return true;
    },
    [fail, onLinked],
  );

  const link = useCallback(
    async (account: AccountUser, event: Event) => {
      const deps = getSyncDeps();
      if (!deps.ok) return fail(deps.error);
      setBusy(true);
      const plan = await planFirstSync(deps.value, account.id);
      setBusy(false);
      if (!plan.ok) return fail(plan.error);
      switch (plan.value.kind) {
        case "same-owner":
          void syncNow();
          showToast(`Welcome back${account.name ? `, ${account.name}` : ""}`);
          onLinked();
          return;
        case "auto": {
          const ok = await runStrategy(account, event, plan.value.strategy);
          if (!ok) setAsk({ account, event, localTasks: 0 });
          return;
        }
        case "ask":
          setChoice("merge");
          setAsk({ account, event, localTasks: plan.value.localTasks });
          return;
      }
    },
    [fail, onLinked, runStrategy],
  );

  const sheet = ask ? (
    <Sheet
      title="Two copies of your day"
      description={`Your account already holds a saved day, and this phone has ${ask.localTasks} ${ask.localTasks === 1 ? "task" : "tasks"}. Pick what to keep.`}
      onClose={() => (busy ? undefined : setAsk(null))}
      testId="merge-sheet"
      footer={
        <Button
          className="min-h-[52px]"
          disabled={busy}
          onClick={() =>
            void runStrategy(ask.account, ask.event, choice).then((ok) => {
              if (ok) setAsk(null);
            })
          }
        >
          {busy ? "Working…" : "Continue"}
        </Button>
      }
    >
      <div role="radiogroup" aria-label="What to keep" className="flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const on = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(option.value)}
              className={`flex items-center gap-3 rounded-card bg-surface px-[15px] py-[13px] text-left ${on ? "border-[1.5px] border-primary shadow-selected" : "border border-border"}`}
            >
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-grip"}`}
              >
                <span className={`size-2.5 rounded-full ${on ? "bg-primary" : ""}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-[7px]">
                  <span className="text-[13.5px] font-bold text-ink">{option.name}</span>
                  {option.recommended ? (
                    <span className="rounded-md bg-tint px-1.5 py-[3px] text-[9.5px] font-bold tracking-[0.06em] text-primary-dark uppercase">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45] font-medium text-text-muted">
                  {option.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? <InlineError error={error} pageId={pageId} /> : null}
    </Sheet>
  ) : null;

  return { link, sheet, busy };
}
