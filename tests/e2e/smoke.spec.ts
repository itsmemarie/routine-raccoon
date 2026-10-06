import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { ROUTES, expect, test, type RouteCase } from "./fixtures";

/** Screens that open one entity get a real id from the seeded routine. */
async function realUrl(page: Page, route: RouteCase): Promise<string> {
  const from = { P02: ["/", /^Drink a pint/], P05: ["/settings/", "Sections in Normal"] } as const;
  const source = route.pageId === "P02" || route.pageId === "P05" ? from[route.pageId] : null;
  if (!source) return route.url;
  await page.goto(source[0]);
  const href = await page.getByRole("link", { name: source[1] }).first().getAttribute("href");
  if (!href) throw new Error(`No link to ${route.name}`);
  return href;
}

/**
 * Smoke: every route renders its screen (data-page-id) with no console errors, and passes an
 * automated accessibility scan (no serious or critical violations).
 *
 * Colour contrast is scanned separately and reported, not gated: some handoff tokens
 * (amber on primary, white on primary at small sizes) are below WCAG AA. TECH_SPEC §5.5 tracks
 * this as a design decision for the PM; remove the exclusion once the tokens are adjusted.
 */
test.describe("smoke", () => {
  for (const route of ROUTES) {
    test(`${route.pageId} ${route.name} renders without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(await realUrl(page, route));
      await expect(page.locator(`[data-page-id="${route.pageId}"]`).first()).toBeVisible();
      expect(errors).toEqual([]);

      const results = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
