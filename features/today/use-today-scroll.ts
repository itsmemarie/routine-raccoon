"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTodayStore } from "./today-store";

/** A section is "where you are" once its top has passed the middle of the screen. */
const IN_VIEW_LINE = 1 / 2;

/**
 * The section the user is looking at: the last one whose top is above the middle of the
 * screen, else the first one. Scrolled to the bottom, it is the last section.
 */
export function sectionInView(): string | null {
  const sections = [...document.querySelectorAll<HTMLElement>("[data-section-id]")];
  // Only once scrolled: a page short enough to fit on screen has no "bottom" to be at.
  const atBottom =
    window.scrollY > 0 &&
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) return sections.at(-1)?.dataset.sectionId ?? null;
  const line = window.innerHeight * IN_VIEW_LINE;
  let current: string | null = sections[0]?.dataset.sectionId ?? null;
  for (const element of sections) {
    if (element.getBoundingClientRect().top > line) break;
    current = element.dataset.sectionId ?? current;
  }
  return current;
}

/**
 * Keeps Today where the user left it. Today renders empty until its live query loads, so a
 * browser or router scroll restore lands on a short page and ends at the top; instead the
 * position is saved while scrolling and put back once, the first time the list is ready.
 */
export function useTodayScroll(ready: boolean): void {
  const restored = useRef(false);

  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const saved = useTodayStore.getState().scrollY;
    if (saved > 0) window.scrollTo(0, saved);
  }, [ready]);

  useEffect(() => {
    if (!ready) return undefined;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        useTodayStore.getState().setScrollY(window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [ready]);
}
