"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { EmptyBox } from "@/components/ui/layout";
import { BackBar, ScreenRoot } from "@/components/ui/screen";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useLog } from "@/data/hooks/use-log";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { LOG_FILTER_LABELS, type LogFilter } from "@/domain/log";
import { formatLogDay } from "@/domain/time";
import type { LogEntry, LogKind } from "@/domain/types";
import { ExportSheet } from "@/features/common";

const PAGE = "P08" as const;
const PAGE_SIZE = 100;
const FILTERS: readonly LogFilter[] = ["all", "completed", "added", "edited", "survival"];

const DOT: Record<LogKind, string> = {
  completed: "bg-primary",
  uncompleted: "bg-text-muted",
  skipped: "bg-text-on-dark",
  added: "bg-section-violet",
  imported: "bg-section-violet",
  edited: "bg-text-muted",
  survival: "bg-primary-mid",
  closed: "bg-ink",
};

function timeOf(entry: LogEntry): string {
  const at = new Date(entry.at);
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function groupByDay(entries: readonly LogEntry[]): [string, LogEntry[]][] {
  const groups = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.day_key);
    if (list) list.push(entry);
    else groups.set(entry.day_key, [entry]);
  }
  return [...groups.entries()];
}

/** Log and Task activity (P08, handoff screen 18). Read-only. */
export function LogScreen() {
  const params = useSearchParams();
  const taskId = params.get("task");
  const [filter, setFilter] = useState<LogFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const today = useEffectiveDayKey();
  const org = useOrganisation();
  const page = useLog({ filter: taskId ? "all" : filter, taskId, limit });

  const task = taskId ? org?.tasks.find((t) => t.id === taskId) : undefined;
  const isActivity = taskId !== null;

  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <BackBar
        backLabel={isActivity ? "Task" : "Settings"}
        title={isActivity ? "Task activity" : "Log"}
        fallback={isActivity ? `/task/?id=${encodeURIComponent(taskId)}` : "/settings/"}
        action={
          <button
            type="button"
            onClick={() => setExporting(true)}
            className="min-h-11 px-1 text-[13px] font-bold text-primary"
          >
            Export
          </button>
        }
      />
      <div className="px-3.5 pt-3.5">
        <p className="text-[12.5px] leading-normal text-text-muted">
          {isActivity
            ? `${task?.name ?? "This task"}: every event, read-only.`
            : "Read-only history. Kept on this phone, included in Export all data, and backed up with an account."}
        </p>
        {isActivity ? null : (
          <div
            role="group"
            aria-label="Filter the log"
            className="mt-[13px] flex flex-wrap gap-[7px]"
          >
            {FILTERS.map((f) => (
              <Chip
                key={f}
                active={filter === f}
                onClick={() => {
                  setFilter(f);
                  setLimit(PAGE_SIZE);
                }}
              >
                {f === "survival" && org ? org.settings.survivalName : LOG_FILTER_LABELS[f]}
              </Chip>
            ))}
          </div>
        )}

        {page && today ? (
          page.entries.length === 0 ? (
            <EmptyBox className="mt-5">Nothing here yet</EmptyBox>
          ) : (
            <>
              {groupByDay(page.entries).map(([dayKey, entries]) => (
                <section key={dayKey} aria-label={formatLogDay(dayKey, today)}>
                  <h2 className="mt-5 mb-2.5 font-display text-[18px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
                    {formatLogDay(dayKey, today)}
                  </h2>
                  <ul className="flex flex-col gap-[7px]">
                    {entries.map((entry) => (
                      <li
                        key={entry.id}
                        data-testid="log-entry"
                        className="flex gap-[11px] rounded-[14px] border border-border bg-surface px-[15px] py-[13px]"
                      >
                        <span className="w-[38px] shrink-0 pt-px text-[11.5px] font-semibold text-text-muted tabular-nums">
                          {timeOf(entry)}
                        </span>
                        <span
                          aria-hidden
                          className={`mt-[5px] size-2 shrink-0 rounded-[3px] ${DOT[entry.kind]}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold break-words text-ink">
                            {entry.title}
                          </span>
                          {entry.meta ? (
                            <span className="mt-0.5 block text-[11.5px] font-medium break-words text-text-muted">
                              {entry.meta}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {page.hasMore ? (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  className="mt-4 flex min-h-12 w-full items-center justify-center rounded-card bg-canvas text-[13px] font-semibold text-ink"
                >
                  Show older entries
                </button>
              ) : null}
            </>
          )
        ) : null}
      </div>
      {exporting ? (
        <ExportSheet
          pageId={PAGE}
          includesArchive={org?.settings.exportArchive ?? true}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </ScreenRoot>
  );
}
