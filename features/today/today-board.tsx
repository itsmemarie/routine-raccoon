"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { useDragSensors } from "@/components/ui/drag-sensors";
import type { MenuItem } from "@/components/ui/menu";
import type { TodaySection, TodayTask } from "@/domain/today";
import type { Step } from "@/domain/types";
import { pickupFeedback } from "@/lib/platform/haptics";
import { SectionBlock } from "./section-block";
import { SkippedTaskRow, SortableTaskCard, TaskCardView } from "./task-card";

export interface BoardMove {
  readonly taskId: string;
  readonly sectionId: string;
  /** Place directly after this task; null = first; undefined = end of the section. */
  readonly afterTaskId: string | null | undefined;
}

const SECTION_PREFIX = "section:";

function asSectionId(id: UniqueIdentifier | undefined): string | null {
  const text = id === undefined ? "" : String(id);
  return text.startsWith(SECTION_PREFIX) ? text.slice(SECTION_PREFIX.length) : null;
}

/** Prefer task cards under the pointer, then sections; fall back to the nearest droppable. */
const collision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const pool = pointer.length > 0 ? pointer : rectIntersection(args);
  const cards = pool.filter((c) => asSectionId(c.id) === null);
  if (cards.length > 0) return cards;
  if (pool.length > 0) return pool;
  return closestCenter(args);
};

/**
 * Today's sections with drag and drop (handoff "Drag and drop", PRD R2): reorder within a
 * section and move between sections, onto cards, headers, collapsed or empty sections. Moves
 * are committed through `onMove` (one command); the live query then re-renders the result.
 * Ticked tasks leave the list and wait behind each section's "N done" row, where they can be
 * un-ticked. Swiping a card left skips it for today; skipped tasks wait behind "N skipped".
 */
export function TodayBoard({
  sections,
  planId,
  ticking,
  collapsed,
  showDone,
  showSkipped,
  dragDisabled,
  menuItemsFor,
  onToggle,
  onToggleDone,
  onToggleSkipped,
  onMove,
  onSkip,
  onBringBack,
  onBringBackSection,
  card,
}: {
  sections: readonly TodaySection[];
  /** The plan Today shows: "+ Add task" in a section creates the task there. */
  planId: string | null;
  ticking: Readonly<Record<string, true>>;
  collapsed: Readonly<Record<string, true>>;
  /** Sections whose ticked tasks are shown (session only). */
  showDone: Readonly<Record<string, true>>;
  /** Sections whose skipped tasks are shown (session only). */
  showSkipped: Readonly<Record<string, true>>;
  dragDisabled: boolean;
  menuItemsFor: (view: TodaySection) => readonly MenuItem[];
  onToggle: (sectionId: string) => void;
  onToggleDone: (sectionId: string) => void;
  onToggleSkipped: (sectionId: string) => void;
  onMove: (move: BoardMove) => void;
  /** Swipe left on a card; resolves false when the skip failed. */
  onSkip: (item: TodayTask) => Promise<boolean>;
  onBringBack: (item: TodayTask) => void;
  onBringBackSection: (view: TodaySection) => void;
  card: (item: TodayTask) => {
    onTick: () => void;
    onUntick: () => void;
    onPlay: () => void;
    timerRunning: boolean;
    steps: readonly Step[] | null;
  };
}) {
  const sensors = useDragSensors();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);

  // Cards shown per section: open tasks plus ticked ones still animating out.
  const rowsBySection = useMemo(() => {
    const map = new Map<string, TodayTask[]>();
    for (const view of sections) {
      map.set(
        view.section.id,
        view.tasks.filter((t) => !t.done || ticking[t.task.id]),
      );
    }
    return map;
  }, [sections, ticking]);

  const sectionOfTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const [sectionId, rows] of rowsBySection) {
      for (const row of rows) map.set(row.task.id, sectionId);
    }
    return map;
  }, [rowsBySection]);

  const itemsById = useMemo(
    () => new Map(sections.flatMap((s) => s.tasks).map((t) => [t.task.id, t])),
    [sections],
  );
  const sectionNames = useMemo(
    () => new Map(sections.map((s) => [s.section.id, s.section.name])),
    [sections],
  );

  const targetSection = (id: UniqueIdentifier | undefined): string | null =>
    asSectionId(id) ?? (id === undefined ? null : (sectionOfTask.get(String(id)) ?? null));

  const nameOf = (id: UniqueIdentifier) => itemsById.get(String(id))?.task.name ?? "task";
  const placeOf = (id: UniqueIdentifier | undefined) => {
    const section = targetSection(id);
    return section ? (sectionNames.get(section) ?? "a section") : "nowhere";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    // A picked-up card starts over itself; saying so would talk over "Picked up …".
    onDragOver: ({ active, over }) =>
      over?.id === active.id
        ? undefined
        : over
          ? `${nameOf(active.id)} is over ${placeOf(over.id)}.`
          : `${nameOf(active.id)} is not over a section.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped in ${placeOf(over.id)}.`
        : `${nameOf(active.id)} put back.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  const reset = () => {
    setActiveId(null);
    setOverSectionId(null);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    pickupFeedback();
    setActiveId(String(active.id));
  };
  const onDragOver = ({ over }: DragOverEvent) => setOverSectionId(targetSection(over?.id));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    reset();
    if (!over) return;
    const taskId = String(active.id);
    const from = sectionOfTask.get(taskId);
    const to = targetSection(over.id);
    if (!from || !to) return;
    const list = (rowsBySection.get(to) ?? []).map((r) => r.task.id);

    if (asSectionId(over.id) !== null) {
      if (from !== to) onMove({ taskId, sectionId: to, afterTaskId: undefined });
      return;
    }
    const overId = String(over.id);
    if (from === to) {
      const oldIndex = list.indexOf(taskId);
      const newIndex = list.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const order = arrayMove(list, oldIndex, newIndex);
      onMove({ taskId, sectionId: to, afterTaskId: order[newIndex - 1] ?? null });
      return;
    }
    // Another section: before or after the card under the pointer, by its vertical centre.
    const overIndex = list.indexOf(overId);
    const dragged = active.rect.current.translated;
    const below = dragged
      ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
      : true;
    const insertAt = overIndex + (below ? 1 : 0);
    onMove({ taskId, sectionId: to, afterTaskId: list[insertAt - 1] ?? null });
  };

  const active = activeId ? itemsById.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move a task, press Space or Enter on its handle, use the arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.",
        },
      }}
    >
      <div className="mt-1 flex flex-col">
        {sections.map((view) => {
          const rows = rowsBySection.get(view.section.id) ?? [];
          const doneRows = view.tasks.filter((t) => t.done && !ticking[t.task.id]);
          const emptyText =
            view.emptyText ??
            (view.tasks.length > 0 && view.tasks.every((t) => t.done)
              ? "All done here"
              : "Nothing here for this filter");
          return (
            <SectionBlock
              key={view.section.id}
              view={view}
              planId={planId}
              rows={rows}
              doneRows={doneRows}
              emptyText={emptyText}
              collapsed={Boolean(collapsed[view.section.id])}
              showDone={Boolean(showDone[view.section.id])}
              showSkipped={Boolean(showSkipped[view.section.id])}
              isDropTarget={activeId !== null && overSectionId === view.section.id}
              menuItems={menuItemsFor(view)}
              onToggle={() => onToggle(view.section.id)}
              onToggleDone={() => onToggleDone(view.section.id)}
              onToggleSkipped={() => onToggleSkipped(view.section.id)}
              onBringBack={() => onBringBackSection(view)}
              renderSkippedRow={(item) => (
                <SkippedTaskRow
                  key={item.task.id}
                  item={item}
                  onBringBack={() => onBringBack(item)}
                />
              )}
              renderDoneCard={(item) => (
                <li key={item.task.id} className="list-none">
                  <TaskCardView
                    item={item}
                    ticking={false}
                    // Ticked cards don't drag: a spacer keeps them aligned with the open ones.
                    handle={<span aria-hidden className="w-6 shrink-0" />}
                    {...card(item)}
                  />
                </li>
              )}
              renderCard={(item) => (
                <SortableTaskCard
                  key={item.task.id}
                  item={item}
                  ticking={Boolean(ticking[item.task.id])}
                  disabled={dragDisabled || item.done}
                  onSkip={() => onSkip(item)}
                  {...card(item)}
                />
              )}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <TaskCardView
            item={active}
            ticking={false}
            state="overlay"
            onTick={() => undefined}
            onUntick={() => undefined}
            onPlay={() => undefined}
            timerRunning={false}
            steps={null}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
