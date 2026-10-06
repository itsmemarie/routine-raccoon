import { ROUTES, expect, test, withQuery } from "./fixtures";

/**
 * Product requirement: every page always carries error codes. For every route in the page
 * registry, force a failure and assert the screen shows the code AND the page ID.
 */
test.describe("every page shows an error code with its page ID", () => {
  for (const route of ROUTES) {
    test(`${route.pageId} ${route.name}: forced RR-DB-002`, async ({ page }) => {
      await page.goto(withQuery(route.url, "__fault=RR-DB-002"));
      const tag = page.locator(`[data-error-code="RR-DB-002"][data-page-id="${route.pageId}"]`);
      await expect(tag).toBeVisible();
      await expect(tag).toHaveText(new RegExp(`RR-DB-002 · ${route.pageId} · #[0-9a-f]{8}`));
      await expect(page.getByTestId("error-panel")).toContainText("Couldn't save that change");
    });
  }

  test("a crash with no specific code shows RR-APP-001", async ({ page }) => {
    await page.goto("/settings/?__fault=render");
    await expect(page.locator('[data-error-code="RR-APP-001"][data-page-id="P06"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("a link missing its id shows RR-APP-004 on Task detail", async ({ page }) => {
    await page.goto("/task/");
    await expect(page.locator('[data-error-code="RR-APP-004"][data-page-id="P02"]')).toBeVisible();
    await page.getByRole("link", { name: "Go to Today" }).click();
    await expect(page.locator('[data-page-id="P01"]')).toBeVisible();
  });

  test("a link to a task or Day Plan that no longer exists shows RR-DB-005", async ({ page }) => {
    await page.goto("/task/?id=00000000-0000-4000-8000-000000000000");
    await expect(page.locator('[data-error-code="RR-DB-005"][data-page-id="P02"]')).toBeVisible();
    await page.goto("/plans/sections/?plan=00000000-0000-4000-8000-000000000000");
    await expect(page.locator('[data-error-code="RR-DB-005"][data-page-id="P05"]')).toBeVisible();
  });

  test("an unknown page shows RR-APP-003", async ({ page }) => {
    await page.goto("/does-not-exist/");
    await expect(page.locator('[data-error-code="RR-APP-003"]')).toBeVisible();
  });

  test("account screens degrade gracefully without Supabase config (RR-AUTH-008)", async ({
    page,
  }) => {
    await page.goto("/account/");
    await expect(page.locator('[data-error-code="RR-AUTH-008"][data-page-id="P14"]')).toBeVisible();
  });

  test("Help lists every registered code", async ({ page }) => {
    await page.goto("/help/");
    await expect(page.locator("#RR-DB-002")).toContainText("Couldn't save that change");
    await expect(page.locator("#RR-AUTH-008")).toBeVisible();
  });
});
