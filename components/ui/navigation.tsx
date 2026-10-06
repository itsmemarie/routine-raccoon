"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";

/**
 * In-app route stack. `history.length` counts pages from other sites too and can't tell us
 * whether "back" stays inside the app, so the shell records every route change here: arriving
 * at the entry below the top is a back navigation (pop), anything else a push.
 */
const stack: string[] = [];

function record(route: string): void {
  if (stack.at(-1) === route) return;
  if (stack.at(-2) === route) stack.pop();
  else stack.push(route);
  if (stack.length > 50) stack.splice(0, stack.length - 50);
}

/** Mounted once by the shell (inside Suspense: it reads search params). */
export function NavigationTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const query = search.toString();
    record(query ? `${pathname}?${query}` : pathname);
  }, [pathname, search]);
  return null;
}

/** True when going back stays inside the app. */
export function canGoBack(): boolean {
  return stack.length > 1;
}

/** Test seam. */
export function resetNavigationStack(): void {
  stack.length = 0;
}

/**
 * Back that never leaves the app: history back when the previous page is ours, otherwise
 * `fallback` (the screen's natural parent), replacing the current entry.
 */
export function useBack(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
