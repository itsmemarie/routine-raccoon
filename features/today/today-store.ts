import { create } from "zustand";
import type { TodayFilter } from "@/domain/today";

/**
 * Ephemeral Today UI state (TECH_SPEC §1.3). Not persisted: collapse is per session (handoff)
 * and the filter resets when a plan is picked.
 */
interface TodayUiState {
  filter: TodayFilter;
  /** Section ids collapsed in this session. */
  collapsed: Readonly<Record<string, true>>;
  /** Tasks ticked in this session that are still animating out (struck through, greyed). */
  ticking: Readonly<Record<string, true>>;
  planSheetOpen: boolean;
  setFilter: (filter: TodayFilter) => void;
  toggleCollapsed: (sectionId: string) => void;
  setTicking: (taskId: string, on: boolean) => void;
  setPlanSheetOpen: (open: boolean) => void;
}

export const useTodayStore = create<TodayUiState>((set) => ({
  filter: "all",
  collapsed: {},
  ticking: {},
  planSheetOpen: false,
  setFilter: (filter) => set({ filter }),
  toggleCollapsed: (sectionId) =>
    set((state) => {
      const next = { ...state.collapsed };
      if (next[sectionId]) delete next[sectionId];
      else next[sectionId] = true;
      return { collapsed: next };
    }),
  setTicking: (taskId, on) =>
    set((state) => {
      const next = { ...state.ticking };
      if (on) next[taskId] = true;
      else delete next[taskId];
      return { ticking: next };
    }),
  setPlanSheetOpen: (planSheetOpen) => set({ planSheetOpen }),
}));
