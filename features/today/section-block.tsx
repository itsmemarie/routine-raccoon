"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronDown, Clock, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Dot } from "@/components/ui/layout";
import { MenuButton, type MenuItem } from "@/components/ui/menu";
import { formatDuration } from "@/domain/duration";
import type { TodaySection, TodayTask } from "@/domain/today";

/** Droppable id of a section (task ids are plain uuids, so the prefix can't collide). */
export function sectionDropId(sectionId: string): string {
  return `section:${sectionId}`;
}

/**
 * One section on Today: header (collapse, colour dot, name, start time, total, ⋯ menu), its
 * task cards, the empty drop box, and "+ Add task". The whole block accepts drops, including
 * when collapsed or empty (handoff "Drag and drop").
 */
export function SectionBlock({
  view,
  rows,
  emptyText,
  collapsed,
  isDropTarget,
  menuItems,
  onToggle,
  renderCard,
}: {
  view: TodaySection;
  /** Visible cards (open tasks plus ticked ones still animating out). */
  rows: readonly TodayTask[];
  /** Shown when no card is visible. */
  emptyText: string;
  collapsed: boolean;
  isDropTarget: boolean;
  menuItems: readonly MenuItem[];
  onToggle: () => void;
  renderCard: (item: TodayTask) => ReactNode;
}) {
  const { section } = view;
  const { setNodeRef } = useDroppable({ id: sectionDropId(section.id) });
  const listId = `section-${section.id}`;
  return (
    <section
      ref={setNodeRef}
      data-testid="section"
      aria-label={section.name}
      className={`rounded-[18px] transition-colors ${isDropTarget ? "bg-tint/50" : ""}`}
    >
      <div className="flex items-center gap-1 pt-3 pr-0 pb-1.5 pl-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-1 text-left"
        >
          <ChevronDown
            size={16}
            strokeWidth={1.8}
            aria-hidden
            className={`shrink-0 text-text-muted transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <Dot color={section.color} ring={isDropTarget} />
          <span className="truncate font-display text-base font-semibold text-ink">
            {section.name}
          </span>
          {section.start_time ? (
            <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-text-muted">
              <Clock size={12} strokeWidth={1.8} aria-hidden />
              {section.start_time}
            </span>
          ) : null}
          <span
            className="ml-auto shrink-0 text-[13px] font-semibold"
            style={{ color: section.color }}
            aria-label={`${formatDuration(view.remainingMinutes)} left`}
          >
            {formatDuration(view.remainingMinutes)}
          </span>
        </button>
        <MenuButton
          label={`${section.name} options`}
          items={menuItems}
          trigger={<MoreHorizontal size={18} strokeWidth={1.8} aria-hidden />}
          triggerClassName="flex size-11 items-center justify-center rounded-[10px] text-text-muted hover:bg-canvas"
        />
      </div>
      {collapsed ? null : (
        <div id={listId} className="pb-1">
          {rows.length === 0 ? (
            <p className="rounded-card border-[1.5px] border-dashed border-border-strong p-[13px] text-center text-[12.5px] font-medium text-text-faint">
              {emptyText}
            </p>
          ) : (
            <SortableContext
              items={rows.map((r) => r.task.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">{rows.map((item) => renderCard(item))}</ul>
            </SortableContext>
          )}
          <Link
            href={`/task/edit/?section=${encodeURIComponent(section.id)}`}
            aria-label={`Add task to ${section.name}`}
            className="mt-2 flex min-h-11 items-center gap-[9px] rounded-chip px-[15px] text-[13px] font-semibold text-text-muted hover:bg-canvas hover:text-primary"
          >
            <span className="flex size-5 items-center justify-center rounded-[7px] border-[1.5px] border-dashed border-grip">
              <Plus size={10} strokeWidth={2} aria-hidden />
            </span>
            Add task
          </Link>
        </div>
      )}
    </section>
  );
}
