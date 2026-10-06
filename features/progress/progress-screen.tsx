"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyBox, GroupHeading } from "@/components/ui/layout";
import { ScreenRoot } from "@/components/ui/screen";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useProgressInput } from "@/data/hooks/use-progress";
import { formatDuration } from "@/domain/duration";
import {
  buildProgress,
  monthStart,
  shiftMonth,
  type CalendarCell,
  type DayState,
} from "@/domain/progress";
import { daysBetween, formatDayShort } from "@/domain/time";
import { TabBar } from "@/features/shell";

const PAGE = "P07" as const;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const HABITS_SHOWN = 12;

const CELL: Record<DayState, string> = {
  full: "bg-primary text-white",
  survival: "border-[1.5px] border-primary-mid bg-tint font-bold text-primary-dark",
  partial: "bg-primary/45 text-white",
  empty: "bg-canvas text-text-muted",
  today: "bg-ink text-white",
  future: "border-[1.5px] border-dashed border-grip bg-canvas text-text-muted",
};

function cellLabel(cell: CalendarCell, survivalName: string): string {
  const day = formatDayShort(cell.dayKey);
  switch (cell.state) {
    case "future":
      return `${day}: still to come`;
    case "full":
      return `${day}: full day, ${cell.ticked} of ${cell.total} ticked`;
    case "survival":
      return `${day}: ${survivalName} Day, ${cell.ticked} of ${cell.total} ticked`;
    case "today":
      return `${day}: today, ${cell.ticked} of ${cell.total} ticked so far`;
    case "partial":
      return `${day}: ${cell.ticked} of ${cell.total} ticked`;
    case "empty":
      return `${day}: nothing ticked`;
  }
}

function Card({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-3 rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <GroupHeading>{title}</GroupHeading>
        {aside ? <span className="text-[12px] font-semibold text-text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** Progress (P07, handoff screen 17): kept, not scored. No points, no streaks (PRD R13). */
export function ProgressScreen() {
  const today = useEffectiveDayKey();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? (today ? monthStart(today) : null);
  const input = useProgressInput(shown ?? "1970-01-01", shown ? today : null);
  const view = useMemo(() => (input ? buildProgress(input) : null), [input]);
  const [allHabits, setAllHabits] = useState(false);

  if (!today || !shown || !view || !input) return <ScreenRoot pageId={PAGE} className="pb-28" />;
  const survivalName = input.settings.survivalName;
  const isCurrent = daysBetween(monthStart(today), shown) >= 0;
  const habits = allHabits ? view.habits : view.habits.slice(0, HABITS_SHOWN);
  const maxMinutes = Math.max(1, ...view.timeBySection.map((s) => s.minutes));

  return (
    <ScreenRoot pageId={PAGE} className="px-3.5 pt-3.5 pb-28">
      <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.03em] text-ink">
        Progress
      </h1>
      <p className="mt-1.5 text-[12.5px] leading-normal text-text-muted">
        {survivalName} Days count as showing up. Shrinking the day is using the app properly.
      </p>

      <section
        aria-label="This month"
        className="mt-4 rounded-[20px] border border-border bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <GroupHeading>{isCurrent ? "This month" : view.monthLabel}</GroupHeading>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(shown, -1))}
              className="flex size-11 items-center justify-center rounded-full text-text-muted"
            >
              <ChevronLeft size={18} strokeWidth={1.8} />
            </button>
            <span className="min-w-[70px] text-center text-[12px] font-semibold text-text-muted">
              {view.monthLabel}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={isCurrent}
              onClick={() => setMonth(shiftMonth(shown, 1))}
              className="flex size-11 items-center justify-center rounded-full text-text-muted disabled:opacity-30"
            >
              <ChevronRight size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div aria-hidden className="mt-3 grid grid-cols-7 gap-[5px]">
          {WEEKDAYS.map((d, i) => (
            <span
              key={`${d}${i}`}
              className={`text-center text-[10px] font-semibold ${i === 6 ? "text-primary" : "text-text-muted"}`}
            >
              {d}
            </span>
          ))}
        </div>
        <ol
          aria-label={`${view.monthLabel}, day by day`}
          className="mt-[5px] grid grid-cols-7 gap-[5px]"
        >
          {Array.from({ length: view.leadingBlanks }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden />
          ))}
          {view.cells.map((cell) => (
            <li
              key={cell.dayKey}
              aria-label={cellLabel(cell, survivalName)}
              data-state={cell.state}
              className={`flex aspect-square items-center justify-center rounded-lg text-[10.5px] font-semibold ${CELL[cell.state]}`}
            >
              <span aria-hidden>{cell.day}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-border pt-[13px] text-[11.5px] font-medium text-text-muted">
          <span className="flex items-center gap-[7px]">
            <span aria-hidden className="size-[9px] rounded-[3px] bg-primary" /> Full day
          </span>
          <span className="flex items-center gap-[7px]">
            <span
              aria-hidden
              className="size-[9px] rounded-[3px] border-[1.5px] border-primary-mid bg-tint"
            />{" "}
            {survivalName} Day
          </span>
          <span className="ml-auto font-semibold text-ink">{view.tickedThisMonth} ticked</span>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <div className="rounded-[20px] bg-ink p-4">
          <p className="font-display text-[30px] leading-none font-bold tracking-[-0.04em] text-white">
            {view.showedUp}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.35] font-medium text-text-on-dark">
            days you showed up
          </p>
        </div>
        <div className="rounded-[20px] border border-border bg-surface p-4">
          <p className="font-display text-[30px] leading-none font-bold tracking-[-0.04em] text-ink">
            {view.fullDays}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.35] font-medium text-text-muted">
            full days
          </p>
        </div>
        <div className="rounded-[20px] border border-border bg-surface p-4">
          <p className="font-display text-[30px] leading-none font-bold tracking-[-0.04em] text-primary">
            {view.survivalDays}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.35] font-medium text-text-muted">
            {survivalName} Days
          </p>
        </div>
      </div>

      <Card title="Days per habit" aside={isCurrent ? "This month" : view.monthLabel}>
        {habits.length === 0 ? (
          <EmptyBox className="mt-3">Tick a task and it shows up here.</EmptyBox>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-3">
            {habits.map((habit) => (
              <li key={habit.task.id}>
                <Link
                  href={`/task/?id=${encodeURIComponent(habit.task.id)}`}
                  className="flex min-h-11 items-center gap-[11px]"
                >
                  <span aria-hidden className="w-5 shrink-0 text-center text-base">
                    {habit.task.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {habit.task.name}
                    </span>
                    <span
                      aria-hidden
                      className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-canvas"
                    >
                      <span
                        className="block h-full rounded-[3px] bg-primary"
                        style={{
                          width: `${Math.round((habit.done / Math.max(1, habit.scheduled)) * 100)}%`,
                        }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-[15px] leading-none font-bold text-ink">
                      {habit.done}
                    </span>
                    <span className="mt-[3px] block text-[10.5px] font-medium text-text-muted">
                      of {habit.scheduled} {habit.scheduled === 1 ? "day" : "days"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {view.habits.length > HABITS_SHOWN ? (
          <button
            type="button"
            onClick={() => setAllHabits((v) => !v)}
            className="mt-2 min-h-11 text-[12.5px] font-semibold text-primary"
          >
            {allHabits ? "Show fewer" : `Show all ${view.habits.length}`}
          </button>
        ) : null}
      </Card>

      <Card title="Avoiding this">
        <p className="mt-2 text-[12.5px] leading-normal text-text-muted">
          Not done four or more days running. Days you didn&apos;t open the app don&apos;t count.
        </p>
        {view.avoided.length === 0 ? (
          <p className="mt-3 text-[13px] font-medium text-ink-muted">
            Nothing is being avoided right now.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {view.avoided.map((row) => (
              <li key={row.task.id}>
                <Link
                  href={`/task/?id=${encodeURIComponent(row.task.id)}`}
                  className="flex min-h-11 items-center justify-between gap-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {row.task.emoji} {row.task.name}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-muted">
                      {row.run} days running
                    </span>
                  </span>
                  <ChevronRight
                    size={15}
                    strokeWidth={1.8}
                    className="shrink-0 text-text-faint"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Where the time went">
        {view.timeBySection.length === 0 ? (
          <EmptyBox className="mt-3">Ticked tasks add their minutes here.</EmptyBox>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-3">
            {view.timeBySection.map(({ section, minutes }) => (
              <li key={section.id}>
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ background: section.color }}
                  />
                  <span className="text-[13px] font-semibold text-ink">{section.name}</span>
                  <span className="ml-auto text-[12.5px] font-semibold text-text-muted">
                    {formatDuration(minutes)}
                  </span>
                </div>
                <div aria-hidden className="mt-[7px] h-1.5 rounded-[3px] bg-canvas">
                  <div
                    className="h-full rounded-[3px]"
                    style={{
                      width: `${Math.round((minutes / maxMinutes) * 100)}%`,
                      background: section.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TabBar />
    </ScreenRoot>
  );
}
