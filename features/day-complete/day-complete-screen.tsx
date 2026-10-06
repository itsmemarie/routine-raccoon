"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ScreenRoot } from "@/components/ui/screen";
import { defaultContext } from "@/data/commands/context";
import { closeDay } from "@/data/commands/day";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { formatDuration } from "@/domain/duration";
import { formatDayHeading } from "@/domain/time";
import { summariseDay } from "@/domain/today";
import { useRun } from "@/features/common";

const PAGE = "P10" as const;

/** Owned artwork (the prototype's film still must not ship): the mascot among confetti. */
function Celebration() {
  const pieces = [
    { x: 12, y: 18, r: 18, c: "bg-amber" },
    { x: 80, y: 12, r: -24, c: "bg-white/80" },
    { x: 22, y: 72, r: 40, c: "bg-white/60" },
    { x: 86, y: 64, r: 12, c: "bg-amber" },
    { x: 48, y: 8, r: -8, c: "bg-tint" },
    { x: 66, y: 84, r: 30, c: "bg-tint" },
    { x: 6, y: 44, r: -36, c: "bg-amber/80" },
    { x: 92, y: 38, r: 52, c: "bg-white/70" },
  ];
  return (
    <div
      aria-hidden
      className="relative h-full min-h-[180px] overflow-hidden rounded-[24px] bg-primary-dark"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`absolute h-2.5 w-5 rounded-sm motion-safe:animate-pop ${p.c}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `rotate(${p.r}deg)` }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <Image
          src="/icons/routine-raccoon-logo.png"
          alt=""
          width={132}
          height={132}
          className="rounded-[32px] shadow-[0_18px_40px_rgba(0,0,0,0.25)]"
        />
      </div>
    </div>
  );
}

/**
 * Day complete (P10, handoff screen 20). Identical for Survival Mode days: a small day is never
 * shown as a lesser day (PRD R15). "Close the day" starts a fresh list (PRD R19).
 */
export function DayCompleteScreen() {
  const router = useRouter();
  const run = useRun(PAGE);
  const dayKey = useEffectiveDayKey();
  const snapshot = useTodaySnapshot(dayKey);
  const [closing, setClosing] = useState(false);
  const summary = useMemo(() => (snapshot ? summariseDay(snapshot) : null), [snapshot]);

  if (!dayKey || !snapshot || !summary) return <ScreenRoot pageId={PAGE} className="bg-primary" />;
  const open = summary.total - summary.ticked;
  const survivalName = snapshot.settings.survivalName;
  const headline: [string, string] =
    open > 0 ? ["Calling it a day?", `${open} still open.`] : ["That's the day.", "Nothing left."];
  const blurb =
    open > 0
      ? "Closing starts a fresh list. Everything you ticked stays in the Log."
      : summary.survivalOn
        ? `A ${survivalName} Day counts. You showed up and shrank it to fit.`
        : summary.hard > 0
          ? `You did ${summary.hard} hard ${summary.hard === 1 ? "one" : "ones"} today. That was the difficult part.`
          : "Every task on the list is ticked. The evening is yours.";

  const onClose = async () => {
    setClosing(true);
    const result = await run(closeDay(defaultContext(), { dayKey }), {
      success: "Day closed. Fresh list.",
    });
    setClosing(false);
    if (result.ok) router.replace("/");
  };

  return (
    <ScreenRoot pageId={PAGE} className="flex min-h-dvh animate-pop flex-col bg-primary">
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-[max(28px,env(safe-area-inset-top))]">
        <p className="text-[12.5px] font-semibold text-white/85">{formatDayHeading(dayKey)}</p>
        <h1 className="mt-4 font-display text-[38px] leading-[1.05] font-bold tracking-[-0.04em]">
          <span className="block text-white">{headline[0]}</span>
          <span className="block text-amber">{headline[1]}</span>
        </h1>
        <p className="mt-3.5 max-w-[290px] text-[14px] leading-[1.6] text-white/90">{blurb}</p>
        <div className="mt-6 min-h-0 flex-1">
          <Celebration />
        </div>
      </div>
      <div className="mt-[18px] rounded-t-[26px] bg-screen px-5 pt-5 pb-[max(26px,env(safe-area-inset-bottom))]">
        <dl className="flex gap-2.5">
          {[
            { label: "ticked", value: String(summary.ticked), accent: false },
            { label: "planned", value: formatDuration(summary.minutes), accent: false },
            { label: "hard tasks", value: String(summary.hard), accent: true },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-1 flex-col-reverse rounded-card border border-border bg-surface px-3.5 py-[13px]"
            >
              <dt className="mt-1 text-[11.5px] font-medium text-text-muted">{stat.label}</dt>
              <dd
                className={`font-display text-[24px] leading-none font-bold tracking-[-0.03em] ${stat.accent ? "text-primary" : "text-ink"}`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3.5 flex gap-2.5">
          <Link
            href="/progress/"
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-card bg-canvas text-[14.5px] font-bold text-ink"
          >
            See progress
          </Link>
          <button
            type="button"
            disabled={closing}
            onClick={() => void onClose()}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-card bg-primary text-[14.5px] font-bold text-white disabled:opacity-60"
          >
            Close the day
          </button>
        </div>
      </div>
    </ScreenRoot>
  );
}
