"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export interface SortableRenderArgs {
  /** Drag handle (grip) to place inside the row; works with touch, mouse and keyboard. */
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
      className="-m-2 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
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
 * A vertical list reorderable by drag (grip) or keyboard. Reports a move as "put `id` right
 * after `afterId`" (null = first), which is how the rank commands place items.
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
