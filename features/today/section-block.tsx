"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, ChevronDown, Clock, MoreHorizontal, Plus, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Dot } from "@/components/ui/layout";
import { MenuButton, type MenuItem } from "@/components/ui/menu";
import { formatDuration } from "@/domain/duration";
import { isSectionSkipped, type TodaySection, type TodayTask } from "@/domain/today";

/** Droppable id of a section (task ids are plain uuids, so the prefix can't collide). */
export function sectionDropId(sectionId: string): string {
  return `section:${sectionId}`;
}

/** "+ Add task" for a section: creates in this section of the plan Today shows. */
export function addTaskHref(planId: string | null, sectionId: string | null): string {
  const query = new URLSearchParams();
  if (sectionId) query.set("section", sectionId);
  if (planId) query.set("plan", planId);
  const text = query.toString();
  return text ? `/task/edit/?${text}` : "/task/edit/";
}

/**
 * One section on Today: header (collapse, colour dot, name, start time, total, ⋯ menu), its
 * task cards, the empty drop box, the "N done" row that shows ticked tasks so they can be
 * un-ticked, the "N skipped" row that brings skipped ones back, and "+ Add task". A section
 * skipped for today says so in its header and offers Bring back. The whole block accepts
 * drops, including when collapsed or empty (handoff "Drag and drop").
 */
export function SectionBlock({
  view,
  planId,
  rows,
  doneRows,
  emptyText,
  collapsed,
  showDone,
  showSkipped,
  isDropTarget,
  menuItems,
  onToggle,
  onToggleDone,
  onToggleSkipped,
  onBringBack,
  renderCard,
  renderDoneCard,
  renderSkippedRow,
}: {
  view: TodaySection;
  planId: string | null;
  /** Visible cards (open tasks plus ticked ones still animating out). */
  rows: readonly TodayTask[];
  /** Ticked tasks that have left the list. */
  doneRows: readonly TodayTask[];
  /** Shown when no card is visible. */
  emptyText: string;
  collapsed: boolean;
  showDone: boolean;
  showSkipped: boolean;
  isDropTarget: boolean;
  menuItems: readonly MenuItem[];
  onToggle: () => void;
  onToggleDone: () => void;
  onToggleSkipped: () => void;
  /** Bring the whole skipped section back onto today's list. */
  onBringBack: () => void;
  renderCard: (item: TodayTask) => ReactNode;
  renderDoneCard: (item: TodayTask) => ReactNode;
  renderSkippedRow: (item: TodayTask) => ReactNode;
}) {
  const { section } = view;
  const { setNodeRef } = useDroppable({ id: sectionDropId(section.id) });
  const listId = `section-${section.id}`;
  const doneId = `section-done-${section.id}`;
  const skippedId = `section-skipped-${section.id}`;
  const skipped = isSectionSkipped(view);
  return (
    <section
      ref={setNodeRef}
      data-testid="section"
      data-section-id={section.id}
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
          {skipped ? (
            <span className="ml-auto shrink-0 text-[12.5px] font-semibold text-text-muted">
              Skipped
            </span>
          ) : (
            <span
              className="ml-auto shrink-0 text-[13px] font-semibold"
              style={{ color: section.color }}
              aria-label={`${formatDuration(view.remainingMinutes)} left`}
            >
              {formatDuration(view.remainingMinutes)}
            </span>
          )}
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
          {rows.length === 0 && skipped ? (
            <div className="flex items-center gap-2 rounded-card border-[1.5px] border-dashed border-border-strong py-[3px] pr-[9px] pl-[15px]">
              <p className="flex-1 text-[12.5px] font-medium text-text-faint">Skipped for today</p>
              <button
                type="button"
                onClick={onBringBack}
                aria-label={`Bring back ${section.name}`}
                className="flex min-h-11 shrink-0 items-center gap-[5px] rounded-[10px] bg-screen px-[11px] text-text-muted"
              >
                <Undo2 size={12} strokeWidth={2} aria-hidden />
                <span className="text-[12px] font-semibold">Bring back</span>
              </button>
            </div>
          ) : rows.length === 0 ? (
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
          {doneRows.length > 0 ? (
            <>
              <button
                type="button"
                onClick={onToggleDone}
                aria-expanded={showDone}
                aria-controls={doneId}
                className="mt-2 flex min-h-11 w-full items-center gap-[9px] rounded-chip px-[15px] text-left text-[12.5px] font-semibold text-text-muted hover:bg-canvas"
              >
                <span className="flex size-5 items-center justify-center rounded-[7px] bg-primary">
                  <Check size={11} strokeWidth={3} className="text-white" aria-hidden />
                </span>
                <span className="flex-1">{doneRows.length} done</span>
                <ChevronDown
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden
                  className={`shrink-0 transition-transform ${showDone ? "" : "-rotate-90"}`}
                />
              </button>
              {showDone ? (
                <ul
                  id={doneId}
                  aria-label={`Done in ${section.name}`}
                  className="mt-1 flex flex-col gap-2"
                >
                  {doneRows.map((item) => renderDoneCard(item))}
                </ul>
              ) : null}
            </>
          ) : null}
          {view.skipped.length > 0 ? (
            <>
              <button
                type="button"
                onClick={onToggleSkipped}
                aria-expanded={showSkipped}
                aria-controls={skippedId}
                className="mt-2 flex min-h-11 w-full items-center gap-[9px] rounded-chip px-[15px] text-left text-[12.5px] font-semibold text-text-muted hover:bg-canvas"
              >
                <span className="flex size-5 items-center justify-center rounded-[7px] bg-text-on-dark">
                  <SkipForward size={11} strokeWidth={2.4} className="text-white" aria-hidden />
                </span>
                <span className="flex-1">{view.skipped.length} skipped</span>
                <ChevronDown
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden
                  className={`shrink-0 transition-transform ${showSkipped ? "" : "-rotate-90"}`}
                />
              </button>
              {showSkipped ? (
                <ul
                  id={skippedId}
                  aria-label={`Skipped in ${section.name}`}
                  className="mt-1 flex flex-col gap-2"
                >
                  {view.skipped.map((item) => renderSkippedRow(item))}
                </ul>
              ) : null}
            </>
          ) : null}
          <Link
            href={addTaskHref(planId, section.id)}
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
