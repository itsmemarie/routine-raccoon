"use client";

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** A mouse picks a row up after this much movement. */
export const MOUSE_DRAG_DISTANCE = 4;
/**
 * A finger must rest on the grip this long before a drag starts; moving further than the
 * tolerance first is a scroll. Keeps a thumb swipe that starts on a grip from reordering.
 */
export const TOUCH_DRAG_DELAY_MS = 250;
export const TOUCH_DRAG_TOLERANCE = 8;

/**
 * Sensors shared by every drag-and-drop list: mouse drags at once, touch needs a long press,
 * keyboard (Space, arrows, Space) always works. Grips pair this with `touch-manipulation` so
 * the browser still scrolls when a swipe starts on them.
 */
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DRAG_DELAY_MS, tolerance: TOUCH_DRAG_TOLERANCE },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** Classes for a drag grip: scrollable by swipe, no text selection or long-press callout. */
export const GRIP_TOUCH_CLASS = "touch-manipulation select-none [-webkit-touch-callout:none]";
