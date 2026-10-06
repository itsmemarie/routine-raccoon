import { Plus } from "lucide-react";
import Link from "next/link";

/** Red header: date, Add task, two-line headline (white + amber). Handoff screen 1. */
export function TodayHeader({
  dateLabel,
  headline,
}: {
  dateLabel: string;
  headline: readonly [string, string];
}) {
  return (
    <header className="-mx-3.5 bg-primary px-[22px] pt-[18px] pb-16">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-white/90">{dateLabel}</span>
        <Link
          href="/task/edit/"
          className="flex h-9 items-center gap-1.5 rounded-full bg-white px-[15px] text-[12.5px] font-bold text-primary"
        >
          <Plus size={15} strokeWidth={2.4} aria-hidden />
          Add task
        </Link>
      </div>
      <h1
        className="mt-3.5 font-display text-[27px] leading-[1.1] font-bold tracking-[-0.03em]"
        aria-live="polite"
      >
        <span className="block text-white">{headline[0]}</span>
        <span className="block text-amber">{headline[1]}</span>
      </h1>
    </header>
  );
}
