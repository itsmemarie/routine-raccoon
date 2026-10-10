import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Skip today (owner request, Oct 2026), on the seeded demo routine: swipe a card left to skip
 * it with Undo, skip a whole section from its ⋯ menu, and bring skipped tasks back. Swipes are
 * real touch input (CDP), so the browser's own scroll handling (`touch-action`) is under test.
 */

async function openToday(page: Page) {
  await page.goto("/");
  await expect(headline(page)).toContainText("8 tasks left,");
}

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");
const card = (page: Page, name: string) => page.getByTestId("task-card").filter({ hasText: name });

async function swipe(page: Page, target: Locator, dx: number, dy = 0) {
  // Mid-screen: at the bottom edge the fixed tab bar would take the touch.
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await target.boundingBox();
  if (!box) throw new Error("swipe target is not on screen");
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", px: number, py: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: px, y: py }],
    });
  await send("touchStart", x, y);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await send("touchMove", x + (dx * i) / steps, y + (dy * i) / steps);
  }
  await send("touchEnd", x + dx, y + dy);
  await cdp.detach();
}

test.describe("swipe a task left to skip it", () => {
  test("a long swipe skips it for today; Undo puts it back", async ({ page }) => {
    await openToday(page);
    await swipe(page, card(page, "Drink a pint"), -260);

    await expect(toast(page)).toContainText("Skipped Drink a pint for today");
    await expect(headline(page)).toContainText("7 tasks left,");
    await expect(card(page, "Drink a pint")).toHaveCount(0);
    // The swipe didn't also open the task.
    await expect(page).toHaveURL(/\/$/);
    const morning = page.getByRole("region", { name: "Morning" });
    await expect(morning.getByRole("button", { name: "1 skipped" })).toBeVisible();

    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(page.getByRole("button", { name: "Tick Drink a pint" })).toBeVisible();
    await expect(morning.getByRole("button", { name: "1 skipped" })).toHaveCount(0);
  });

  test("a short swipe springs back and a vertical swipe scrolls", async ({ page }) => {
    await openToday(page);
    await swipe(page, card(page, "Drink a pint"), -50);
    await expect(card(page, "Drink a pint")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    const eat = card(page, "Eat something");
    await eat.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const scrollY = () => page.evaluate(() => window.scrollY);
    const before = await scrollY();
    await swipe(page, eat, -12, -300);
    await expect.poll(scrollY).toBeGreaterThan(before + 100);
    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(toast(page)).toBeHidden();
  });

  test("skipped tasks wait under 'N skipped' and come back one at a time", async ({ page }) => {
    await openToday(page);
    await swipe(page, card(page, "Drink a pint"), -260);
    await expect(headline(page)).toContainText("7 tasks left,");

    const morning = page.getByRole("region", { name: "Morning" });
    await morning.getByRole("button", { name: "1 skipped" }).click();
    await morning.getByRole("button", { name: "Bring back Drink a pint" }).click();

    // The skip's Undo had nothing left to undo: it gives way to the message at once.
    await expect(toast(page)).toContainText("Brought back Drink a pint", { timeout: 2_000 });
    await expect(toast(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(morning.getByRole("button", { name: "Tick Drink a pint" })).toBeVisible();
  });
});

test.describe("skip a whole section", () => {
  test("Skip today in the section menu skips its open tasks; Undo and Bring back restore them", async ({
    page,
  }) => {
    await openToday(page);
    const morning = page.getByRole("region", { name: "Morning" });
    const open = await morning.getByTestId("task-card").count();
    expect(open).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Skip today" }).click();
    await expect(toast(page)).toContainText("Skipped Morning for today");
    await expect(headline(page)).toContainText(`${8 - open} tasks left,`);
    await expect(morning.getByText("Skipped for today")).toBeVisible();
    await expect(morning.getByTestId("task-card")).toHaveCount(0);

    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(morning.getByTestId("task-card")).toHaveCount(open);

    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Skip today" }).click();
    await expect(morning.getByText("Skipped for today")).toBeVisible();
    await morning.getByRole("button", { name: "Bring back Morning" }).click();
    await expect(toast(page)).toContainText("Brought back Morning", { timeout: 2_000 });
    await expect(toast(page).getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(headline(page)).toContainText("8 tasks left,");

    // Skips last for the day: they survive a reload.
    await swipe(page, card(page, "Drink a pint"), -260);
    await expect(headline(page)).toContainText("7 tasks left,");
    await page.reload();
    await expect(headline(page)).toContainText("7 tasks left,");
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Bring back skipped" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");
  });
});
