import { test as base, expect, type Page } from "@playwright/test";
import { PAGES, type PageId } from "../../lib/errors/pages";

/**
 * Shared E2E setup. The clock is pinned to Tuesday 8 Sep 2026, 09:41 Berlin (the prototype's
 * day), so the seeded demo routine always produces the same Today. Timers still run normally.
 */
export const FIXED_NOW = new Date("2026-09-08T09:41:00+02:00");

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await use(page);
  },
});

export { expect };

/** Params a route needs to render (placeholder ids are fine: the fault fires before lookup). */
const REQUIRED: Partial<Record<PageId, string>> = { P02: "id=demo", P05: "plan=demo" };

export interface RouteCase {
  readonly pageId: PageId;
  readonly name: string;
  readonly url: string;
}

/** Every routed page from the registry, as a URL the static export serves (trailing slash). */
export const ROUTES: readonly RouteCase[] = (
  Object.entries(PAGES) as [PageId, (typeof PAGES)[PageId]][]
)
  .filter(([, page]) => page.route !== null)
  .map(([pageId, page]) => {
    const path = page.route === "/" ? "/" : `${page.route}/`;
    const query = REQUIRED[pageId];
    return { pageId, name: page.name, url: query ? `${path}?${query}` : path };
  });

export function withQuery(url: string, query: string): string {
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
}
