"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { pickupFeedback } from "@/lib/platform/haptics";
import { GRIP_TOUCH_CLASS, useDragSensors } from "./drag-sensors";

export interface SortableRenderArgs {
  /** Drag handle (grip) to place inside the row: long-press on touch, mouse, or keyboard. */
  readonly handle: ReactNode;
  readonly dragging: boolean;
  readonly index: number;
}

function Row<T extends { id: string }>({
  item,
  index,
  name,
  render,
}: {
  item: T;
  index: number;
  name: string;
  render: (item: T, args: SortableRenderArgs) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Move ${name}`}
      className={`-m-2 flex size-11 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing ${GRIP_TOUCH_CLASS}`}
    >
      <span aria-hidden className="flex flex-col gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-[1.5px] w-3.5 rounded ${isDragging ? "bg-primary" : "bg-grip"}`}
          />
        ))}
      </span>
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`list-none ${isDragging ? "relative z-10" : ""}`}
    >
      {render(item, { handle, dragging: isDragging, index })}
    </li>
  );
}

/**
 * A vertical list reorderable by drag (grip; long-press on touch) or keyboard. Reports a move as
 * "put `id` right after `afterId`" (null = first), which is how the rank commands place items.
 */
export function SortableList<T extends { id: string }>({
  items,
  nameOf,
  onReorder,
  render,
  label,
  className = "flex flex-col gap-[9px]",
}: {
  items: readonly T[];
  nameOf: (item: T) => string;
  onReorder: (id: string, afterId: string | null) => void;
  render: (item: T, args: SortableRenderArgs) => ReactNode;
  label: string;
  className?: string;
}) {
  const sensors = useDragSensors();
  const ids = items.map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const name = (id: string | number) => {
    const item = byId.get(String(id));
    return item ? nameOf(item) : "item";
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const order = arrayMove(ids, from, to);
    onReorder(String(active.id), order[to - 1] ?? null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={pickupFeedback}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
          // A picked-up item starts over itself; saying so would talk over "Picked up …".
          onDragOver: ({ active, over }) =>
            over?.id === active.id
              ? undefined
              : over
                ? `${name(active.id)} is over ${name(over.id)}.`
                : `${name(active.id)} is no longer over the list.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `${name(active.id)} dropped at ${name(over.id)}'s place.`
              : `${name(active.id)} put back.`,
          onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
        },
        screenReaderInstructions: {
          draggable:
            "Press Space or Enter on the handle to pick it up, the arrow keys to move it, and Space or Enter to drop it. Escape cancels.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className={className}>
          {items.map((item, index) => (
            <Row key={item.id} item={item} index={index} name={nameOf(item)} render={render} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/** For ↑ / ↓ buttons: the `afterId` that moves item `index` one step up or down. */
export function neighbourMove<T extends { id: string }>(
  items: readonly T[],
  index: number,
  direction: -1 | 1,
): string | null | undefined {
  const target = index + direction;
  if (target < 0 || target >= items.length) return undefined;
  const without = items.filter((_, i) => i !== index);
  return target === 0 ? null : (without[target - 1]?.id ?? null);
}

/** Applies a SortableList move: `id` goes right after `afterId` (null = first). */
export function applyMove<T extends { id: string }>(
  items: readonly T[],
  id: string,
  afterId: string | null,
): T[] {
  const moving = items.find((i) => i.id === id);
  if (!moving) return [...items];
  const rest = items.filter((i) => i.id !== id);
  const at = afterId === null ? 0 : rest.findIndex((i) => i.id === afterId) + 1;
  if (afterId !== null && at === 0) return [...items];
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}
