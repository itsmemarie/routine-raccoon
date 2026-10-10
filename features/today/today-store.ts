import { create } from "zustand";
import type { TodayFilter } from "@/domain/today";

/**
 * Ephemeral Today UI state (TECH_SPEC §1.3). Not persisted: collapse is per session (handoff)
 * and the filter resets when a plan is picked. The scroll position survives leaving Today
 * (open a task, delete it, come back) so the list doesn't jump to the top.
 */
interface TodayUiState {
  filter: TodayFilter;
  /** Section ids collapsed in this session. */
  collapsed: Readonly<Record<string, true>>;
  /** Tasks ticked in this session that are still animating out (struck through, greyed). */
  ticking: Readonly<Record<string, true>>;
  /** Section ids whose ticked tasks are shown under "N done". */
  showDone: Readonly<Record<string, true>>;
  /** Section ids whose skipped tasks are shown under "N skipped". */
  showSkipped: Readonly<Record<string, true>>;
  planSheetOpen: boolean;
  /** Last scroll position on Today, restored when it opens again this session. */
  scrollY: number;
  setFilter: (filter: TodayFilter) => void;
  toggleCollapsed: (sectionId: string) => void;
  setTicking: (taskId: string, on: boolean) => void;
  toggleShowDone: (sectionId: string) => void;
  toggleShowSkipped: (sectionId: string) => void;
  setPlanSheetOpen: (open: boolean) => void;
  setScrollY: (scrollY: number) => void;
}

function toggle(
  map: Readonly<Record<string, true>>,
  key: string,
  on: boolean,
): Readonly<Record<string, true>> {
  const next = { ...map };
  if (on) next[key] = true;
  else delete next[key];
  return next;
}

export const useTodayStore = create<TodayUiState>((set) => ({
  filter: "all",
  collapsed: {},
  ticking: {},
  showDone: {},
  showSkipped: {},
  planSheetOpen: false,
  scrollY: 0,
  setFilter: (filter) => set({ filter }),
  toggleCollapsed: (sectionId) =>
    set((state) => ({
      collapsed: toggle(state.collapsed, sectionId, !state.collapsed[sectionId]),
    })),
  setTicking: (taskId, on) => set((state) => ({ ticking: toggle(state.ticking, taskId, on) })),
  toggleShowDone: (sectionId) =>
    set((state) => ({
      showDone: toggle(state.showDone, sectionId, !state.showDone[sectionId]),
    })),
  toggleShowSkipped: (sectionId) =>
    set((state) => ({
      showSkipped: toggle(state.showSkipped, sectionId, !state.showSkipped[sectionId]),
    })),
  setPlanSheetOpen: (planSheetOpen) => set({ planSheetOpen }),
  setScrollY: (scrollY) => set({ scrollY }),
}));
