"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PromptDialog } from "@/components/ui/confirm";
import { InlineError } from "@/components/errors/inline-error";
import { ScreenRoot } from "@/components/ui/screen";
import { defaultContext } from "@/data/commands/context";
import { dismissDayPrompt, pickPlan, pickSurvivalLevel } from "@/data/commands/day";
import { writeKvCommand } from "@/data/commands/device";
import { createPlan } from "@/data/commands/plans";
import { moveTask } from "@/data/commands/tasks";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useKv } from "@/data/hooks/use-kv";
import { useTodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { formatDayHeading } from "@/domain/time";
import { buildPlanOptions, buildToday, type TodayTask } from "@/domain/today";
import { isLive, type Section, type SurvivalLevel, type Task } from "@/domain/types";
import { isAccountConfigured } from "@/lib/env";
import type { AppError } from "@/lib/errors/app-error";
import type { Result } from "@/lib/errors/result";
import { useRun, useSectionActions } from "@/features/common";
import { TabBar } from "@/features/shell";
import { useTimerControls } from "@/features/timer";
import { DayPrompt } from "./day-prompt";
import { FilterChips } from "./filter-chips";
import { PlanCard } from "./plan-card";
import { PlanSheet } from "./plan-sheet";
import { TodayBoard, type BoardMove } from "./today-board";
import { TodayHeader } from "./today-header";
import { useTodayStore } from "./today-store";
import { useTickWithUndo } from "./use-tick";
import { WelcomeCard } from "./welcome-card";

const PAGE = "P01" as const;

/**
 * Today (P01). Reads one live snapshot, derives everything with the pure `buildToday`
 * selector, and writes only through commands.
 * @see docs/handoff/README.md screens 1–5
 */
export function TodayScreen() {
  const router = useRouter();
  const run = useRun(PAGE);
  const dayKey = useEffectiveDayKey();
  const snapshot = useTodaySnapshot(dayKey);
  const promptDismissedFor = useKv("day_prompt_dismissed");
  const welcomeDismissed = useKv("welcome_dismissed");
  const {
    filter,
    collapsed,
    ticking,
    planSheetOpen,
    setFilter,
    toggleCollapsed,
    setPlanSheetOpen,
  } = useTodayStore();
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanError, setNewPlanError] = useState<AppError | null>(null);
  const sectionActions = useSectionActions(PAGE);
  const timer = useTimerControls(PAGE, dayKey);

  const view = useMemo(
    () => (snapshot && dayKey ? buildToday({ ...snapshot, dayKey, filter }) : null),
    [snapshot, dayKey, filter],
  );
  const planOptions = useMemo(
    () => (snapshot && dayKey ? buildPlanOptions({ ...snapshot, dayKey }) : null),
    [snapshot, dayKey],
  );

  // The undo callback outlives renders: read the latest counts through a ref.
  const countsRef = useRef({ open: Number.POSITIVE_INFINITY, done: 0 });
  useEffect(() => {
    countsRef.current = view
      ? { open: view.planOpenCount, done: view.doneCount }
      : { open: Number.POSITIVE_INFINITY, done: 0 };
  }, [view]);
  const onUndoWindowClosed = useCallback(() => {
    // Day complete once nothing in the day's plan is left (filters don't count).
    if (countsRef.current.open === 0 && countsRef.current.done > 0) router.push("/day-complete/");
  }, [router]);
  const { tick, untick } = useTickWithUndo(dayKey, onUndoWindowClosed);

  const tasksById = useMemo(
    () => new Map<string, Task>(snapshot?.tasks.map((t) => [t.id, t]) ?? []),
    [snapshot],
  );

  const runPick = useCallback(
    async (pick: Promise<Result<void, AppError>>) => {
      const result = await run(pick);
      if (!result.ok) return;
      setFilter("all");
      setPlanSheetOpen(false);
    },
    [run, setFilter, setPlanSheetOpen],
  );

  const onPickPlan = (planId: string) => {
    if (dayKey) void runPick(pickPlan(defaultContext(), { dayKey, planId }));
  };
  const onPickLevel = (level: SurvivalLevel) => {
    if (dayKey) void runPick(pickSurvivalLevel(defaultContext(), { dayKey, level }));
  };

  const onMove = useCallback(
    (move: BoardMove) => {
      void run(
        moveTask(defaultContext(), {
          taskId: move.taskId,
          sectionId: move.sectionId,
          ...(move.afterTaskId === undefined ? {} : { afterTaskId: move.afterTaskId }),
          via: "drag",
        }),
      );
    },
    [run],
  );

  const onTick = useCallback(
    (task: Task) => {
      void tick(task);
      if (timer.current?.taskId === task.id) void timer.stop({ quiet: true });
    },
    [tick, timer],
  );

  if (!view || !dayKey || !snapshot || !planOptions) {
    return <ScreenRoot pageId={PAGE} className="pb-28" />;
  }
  const settings = snapshot.settings;
  const activePlan = view.activePlan;

  const linkCount = (sectionId: string) =>
    snapshot.planSections.filter((l) => l.section_id === sectionId && isLive(l)).length;
  const menuItemsFor = (section: Section) =>
    activePlan ? sectionActions.menuItems(section, activePlan, linkCount(section.id) > 1) : [];

  const hasAnyTask = snapshot.tasks.some((t) => t.deleted_at === null);
  const showWelcome = !hasAnyTask && welcomeDismissed !== true && welcomeDismissed !== undefined;
  const showPrompt =
    settings.showLevel &&
    !showWelcome &&
    snapshot.dayRecord === null &&
    promptDismissedFor !== undefined &&
    promptDismissedFor !== dayKey &&
    view.doneCount === 0 &&
    planOptions.survival.length > 0;

  const stepsFor = (item: TodayTask) => {
    if (filter !== "extra" || item.done) return null;
    return item.openSteps.slice(0, settings.firstStep ? 1 : 3);
  };

  return (
    <ScreenRoot pageId={PAGE} className="px-3.5 pb-40">
      <TodayHeader dateLabel={formatDayHeading(dayKey)} headline={view.headline} />
      <PlanCard
        {...view.planCard}
        survival={view.survivalOn}
        extraSupportCount={view.extraSupportCount}
        extraActive={filter === "extra"}
        onOpenPlans={() => setPlanSheetOpen(true)}
        onToggleExtra={() => setFilter(filter === "extra" ? "all" : "extra")}
      />
      {showWelcome ? (
        <WelcomeCard
          canRestore={isAccountConfigured()}
          onDismiss={() =>
            void run(writeKvCommand(defaultContext(), { key: "welcome_dismissed", value: true }))
          }
        />
      ) : null}
      {showPrompt ? (
        <DayPrompt
          {...planOptions}
          survivalName={settings.survivalName}
          onPickPlan={onPickPlan}
          onPickLevel={onPickLevel}
          onHide={() => void run(dismissDayPrompt(defaultContext(), { dayKey }))}
        />
      ) : null}
      <FilterChips value={filter} onChange={setFilter} />

      <TodayBoard
        sections={view.sections}
        ticking={ticking}
        collapsed={collapsed}
        dragDisabled={false}
        menuItemsFor={menuItemsFor}
        onToggle={toggleCollapsed}
        onMove={onMove}
        card={(item) => ({
          onTick: () => {
            const task = tasksById.get(item.task.id);
            if (task) onTick(task);
          },
          onUntick: () => {
            const task = tasksById.get(item.task.id);
            if (task) void untick(task);
          },
          onPlay: () => timer.start(item.task),
          timerRunning: timer.current?.taskId === item.task.id,
          steps: stepsFor(item),
        })}
      />

      <div className="mt-5 flex flex-col gap-[9px]">
        <Link
          href={
            activePlan
              ? `/section/edit/?plan=${encodeURIComponent(activePlan.id)}`
              : "/section/edit/"
          }
          className="flex min-h-12 items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-border-strong p-3.5 text-[13.5px] font-semibold text-text-muted"
        >
          <Plus size={13} strokeWidth={2.4} aria-hidden /> Add section
        </Link>
        <Link
          href="/task/edit/"
          className="flex min-h-12 items-center justify-center gap-2 rounded-card bg-ink p-3.5 text-[13.5px] font-bold text-white"
        >
          <Plus size={13} strokeWidth={2.4} aria-hidden /> Add task
        </Link>
      </div>

      {planSheetOpen ? (
        <PlanSheet
          {...planOptions}
          survivalName={settings.survivalName}
          activePlanId={activePlan?.id ?? null}
          survivalOn={view.survivalOn}
          onPickPlan={onPickPlan}
          onPickLevel={onPickLevel}
          onNewPlan={() => {
            setPlanSheetOpen(false);
            setNewPlanError(null);
            setNewPlanOpen(true);
          }}
          onClose={() => setPlanSheetOpen(false)}
        />
      ) : null}
      {newPlanOpen ? (
        <PromptDialog
          title="New Day Plan"
          label="Day Plan name"
          placeholder="Travelling, Work from home…"
          maxLength={80}
          submitLabel="Add Day Plan"
          error={newPlanError ? <InlineError error={newPlanError} pageId={PAGE} /> : undefined}
          onCancel={() => setNewPlanOpen(false)}
          onSubmit={(name) =>
            void run(createPlan(defaultContext(), { name }), {
              onInputError: setNewPlanError,
              success: (v) => `Added ${v.name}. Now give it some sections.`,
            }).then((result) => {
              if (!result.ok) return;
              setNewPlanOpen(false);
              router.push(`/plans/sections/?plan=${encodeURIComponent(result.value.planId)}`);
            })
          }
        />
      ) : null}
      {sectionActions.dialogs}
      {timer.dialog}
      <TabBar />
    </ScreenRoot>
  );
}
