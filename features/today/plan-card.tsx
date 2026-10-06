import { ChevronDown, Target } from "lucide-react";

/**
 * "Today's plan" card under the header, with the Extra Support row. Tinted in Survival Mode.
 * @see docs/handoff/README.md "Today's plan picker"
 */
export function PlanCard({
  overline,
  title,
  meta,
  survival,
  extraSupportCount,
  extraActive,
  onOpenPlans,
  onToggleExtra,
}: {
  overline: string;
  title: string;
  meta: string;
  survival: boolean;
  extraSupportCount: number;
  extraActive: boolean;
  onOpenPlans: () => void;
  onToggleExtra: () => void;
}) {
  return (
    <section className="relative z-10 -mt-12 rounded-card-lg bg-surface p-4 shadow-mode-card">
      <button
        type="button"
        onClick={onOpenPlans}
        aria-haspopup="dialog"
        className={`flex items-center gap-3 text-left ${survival ? "-m-2 w-[calc(100%+16px)] rounded-card bg-tint p-2.5 pl-3" : "w-full"}`}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block text-[10.5px] font-semibold tracking-[0.12em] uppercase ${survival ? "text-survival-text" : "text-text-muted"}`}
          >
            {overline}
          </span>
          <span
            className={`mt-1 block font-display text-lg leading-[1.15] font-bold tracking-[-0.02em] ${survival ? "text-primary-dark" : "text-ink"}`}
          >
            {title}
          </span>
          <span
            className={`mt-0.5 block text-[11.5px] font-medium ${survival ? "text-survival-text" : "text-text-muted"}`}
          >
            {meta}
          </span>
        </span>
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${survival ? "bg-white text-primary-dark" : "bg-canvas text-ink"}`}
        >
          <ChevronDown size={16} strokeWidth={1.8} aria-hidden />
        </span>
      </button>
      <div className="my-3.5 h-px bg-border" />
      <button
        type="button"
        onClick={onToggleExtra}
        aria-pressed={extraActive}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3.5 py-3 text-left ${extraActive ? "bg-primary text-white" : "bg-tint text-primary-dark"}`}
      >
        <span
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${extraActive ? "bg-white text-primary" : "bg-primary text-white"}`}
        >
          <Target size={16} strokeWidth={2} aria-hidden />
        </span>
        <span className="text-[13.5px] font-bold">Extra Support for tasks</span>
        <span
          aria-label={`${extraSupportCount} tasks`}
          className={`ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold ${extraActive ? "bg-white text-primary" : "bg-primary text-white"}`}
        >
          {extraSupportCount}
        </span>
      </button>
    </section>
  );
}
