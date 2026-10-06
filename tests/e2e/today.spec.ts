import { expect, test } from "./fixtures";

/**
 * Today vertical slice (M0). Seeded demo routine on Tuesday 8 Sep 2026:
 * Normal = Morning (2+20+3) + Smash it (10+5+15) + Evening (20+10; dinner is Mon/Wed/Fri only)
 *        = 8 tasks, 85 min. "Wind down" runs Fri–Sun only.
 * Bad day survival plan = 5 tasks, shrunk to 23 min.
 */
test.describe("Today", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
  });

  test("shows the date, headline, plan card and sections from the seeded routine", async ({
    page,
  }) => {
    await expect(page.getByText("Tuesday 8 September")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("about 1h 25m.");
    await expect(page.getByRole("button", { name: /Today's plan\s*Normal/ })).toContainText(
      "8 tasks · 1h 25m",
    );
    await expect(page.getByTestId("section")).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Wind down" })).toHaveCount(0);
  });

  test("tick → 5 s undo snackbar → undo restores the task and the total", async ({ page }) => {
    await page.getByRole("button", { name: "Tick Drink a pint" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("7 tasks left,");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("about 1h 23m.");
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Ticked Drink a pint");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
    await expect(page.getByRole("button", { name: "Tick Drink a pint" })).toBeVisible();
  });

  test("a ticked task animates out once the undo window closes", async ({ page }) => {
    await page.getByRole("button", { name: "Tick Eat something" }).click();
    await expect(page.getByRole("button", { name: "Un-tick Eat something" })).toBeVisible();
    await expect(page.getByTestId("toast")).toBeHidden({ timeout: 7_000 });
    await expect(page.getByRole("button", { name: /Eat something/ })).toHaveCount(0);
  });

  test("picking a Survival level switches to that plan and the total visibly drops", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Today's plan/ }).click();
    const sheet = page.getByRole("dialog", { name: "Which kind of day is it?" });
    await sheet.getByRole("button", { name: /Bad day/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("5 tasks left,");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("about 23m.");
    await expect(page.getByRole("button", { name: /Survival Mode Day\s*Bad day/ })).toContainText(
      "from Normal",
    );
    await expect(page.getByText("Survival", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: /Survival Mode Day/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Normal/ })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
  });

  test("filters and Extra Support narrow the list; totals follow", async ({ page }) => {
    await page.getByRole("button", { name: "Hard" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("3 tasks left,");
    await page.getByRole("button", { name: "Under 5m" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("3 tasks left,");
    await page.getByRole("button", { name: /Extra Support for tasks/ }).click();
    // Hard (3) + ≥20 min (Eat something, Foot soak) = 5
    await expect(page.getByRole("heading", { level: 1 })).toContainText("5 tasks left,");
    await page.getByRole("button", { name: "All" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
  });

  test("sections collapse and expand", async ({ page }) => {
    const morning = page.getByRole("button", { name: /Morning/ }).first();
    await morning.click();
    await expect(morning).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Tick Drink a pint" })).toHaveCount(0);
    await morning.click();
    await expect(page.getByRole("button", { name: "Tick Drink a pint" })).toBeVisible();
  });

  test("works offline: ticking writes locally with no network", async ({ page, context }) => {
    await context.setOffline(true);
    await page.getByRole("button", { name: "Tick Book the dentist" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("7 tasks left,");
    await context.setOffline(false);
  });

  test("ticks survive a reload (persisted on the device)", async ({ page }) => {
    await page.getByRole("button", { name: "Tick Drink a pint" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("7 tasks left,");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("7 tasks left,");
  });
});
