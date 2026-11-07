import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * "Separate from other Day Plans" swaps a shared section for copies, and Progress rebuilds past
 * days from the tasks a plan holds now. On the seeded demo routine, with the clock moved on a day.
 */

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const pastDay = (page: Page) => page.getByRole("listitem", { name: "Tue 8 Sep: 3 of 8 ticked" });

async function openProgress(page: Page) {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Progress" })
    .click();
}

test("separating a section keeps the plan's past days on Progress", async ({ page }) => {
  await page.goto("/");
  await expect(headline(page)).toContainText("8 tasks left,");

  // Morning shared on purpose with Travelling, then all of it ticked on Tuesday.
  await page.getByRole("button", { name: "Morning options" }).click();
  await page.getByRole("menuitem", { name: "Edit section" }).click();
  await expect(page.getByRole("heading", { name: "Edit section", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Travelling" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(headline(page)).toContainText("8 tasks left,");
  for (const name of ["Drink a pint", "Eat something", "Straighten your back"]) {
    await page.getByRole("button", { name: `Tick ${name}` }).click();
  }
  await expect(headline(page)).toContainText("5 tasks left,");

  // Wednesday.
  await page.clock.setFixedTime(new Date("2026-09-09T09:41:00+02:00"));
  await page.goto("/");
  await openProgress(page);
  await expect(pastDay(page)).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click();
  await page.getByRole("button", { name: "Morning options" }).click();
  await page.getByRole("menuitem", { name: "Separate from other Day Plans" }).click();
  await expect(page.getByTestId("toast")).toContainText("is now separate in Normal");

  await openProgress(page);
  await expect(pastDay(page)).toBeVisible();
  await expect(page.getByRole("link", { name: /Drink a pint\s*1 of 2 days/ })).toBeVisible();
});
