import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Coupling (handoff "Coupling") on the seeded demo routine (Tuesday 8 Sep 2026, 8 tasks on
 * Normal). A coupled task is a copy in each place that shares edits but not ticks; a coupled
 * section is one section in several Day Plans. Changes are staged on the sheet and say what
 * they will do before they happen.
 */

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");
const sheet = (page: Page) => page.getByTestId("coupling-sheet");

async function pickTodayPlan(page: Page, name: string) {
  await page.getByRole("button", { name: /Today's plan/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(`Today's plan\\s*${name}`) }),
  ).toBeVisible();
}

async function coupleBackWithTravelling(page: Page) {
  await page.goto("/");
  await expect(headline(page)).toContainText("8 tasks left,");
  await page.getByRole("link", { name: /^Straighten your back/ }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Couple with…" }).click();
  await expect(sheet(page)).toBeVisible();
  // Nothing is staged yet, so nothing can be saved.
  await expect(sheet(page).getByRole("button", { name: "Turn a place on or off" })).toBeDisabled();
  await sheet(page).getByRole("switch", { name: "Coupled in Travelling" }).click();
  await expect(sheet(page)).toContainText("gets a coupled copy");
  await sheet(page).getByRole("button", { name: "Couple to 1" }).click();
  await expect(toast(page)).toContainText("Straighten your back coupled with Travelling");
}

test.describe("Coupling a task", () => {
  test("edits reach the coupled copy, ticks don't", async ({ page }) => {
    await coupleBackWithTravelling(page);
    await expect(page.getByTestId("coupled-banner")).toContainText(
      "Edits here also update Straighten your back in Travelling",
    );

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Task name" }).fill("Stretch your back");
    await expect(page.getByTestId("save-bar")).toContainText("Saves to 2 places");
    await page.getByRole("button", { name: "Save" }).first().click();
    // Saved: back on Task detail under the new name.
    await expect(headline(page)).toHaveText("Stretch your back");
    await page.goto("/");
    await expect(headline(page)).toContainText("8 tasks left,");

    await pickTodayPlan(page, "Travelling");
    const copy = page.getByRole("button", { name: "Tick Stretch your back" });
    await expect(copy).toBeVisible();
    await expect(page.getByRole("img", { name: "Coupled with 1 other place" })).toBeVisible();
    await copy.click();
    await expect(page.getByRole("button", { name: "Un-tick Stretch your back" })).toBeVisible();

    await pickTodayPlan(page, "Normal");
    await expect(page.getByRole("button", { name: "Tick Stretch your back" })).toBeVisible();
  });

  test('"Edit only here" decouples, and Undo couples again', async ({ page }) => {
    await coupleBackWithTravelling(page);
    const banner = page.getByTestId("coupled-banner");
    await banner.getByRole("button", { name: "Edit only here" }).click();
    await expect(toast(page)).toContainText("Edits to Straighten your back now stay here");
    await expect(banner).toHaveCount(0);
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(banner).toBeVisible();
  });

  test('"Keep them coupled" on New task couples the copies', async ({ page }) => {
    await page.goto("/");
    await expect(headline(page)).toContainText("8 tasks left,");
    await page.getByRole("link", { name: "Add task to Morning" }).click();
    await page.getByRole("textbox", { name: "Task name" }).fill("Vitamins");
    const coupled = page.getByRole("switch", { name: "Keep them coupled" });
    await expect(coupled).toHaveCount(0);
    await page
      .getByRole("group", { name: "Other Day Plans" })
      .getByRole("button", { name: "Travelling" })
      .click();
    await expect(coupled).toHaveAttribute("aria-checked", "false");
    await coupled.click();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(headline(page)).toContainText("9 tasks left,");

    await page.getByRole("link", { name: /^Vitamins/ }).click();
    await expect(page.getByRole("button", { name: /Coupled with\s*Travelling/ })).toBeVisible();
  });
});

test.describe("Coupling a section", () => {
  test("couples Morning into Travelling, and Undo takes it back", async ({ page }) => {
    await page.goto("/");
    await expect(headline(page)).toContainText("8 tasks left,");
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Couple with Day Plans…" }).click();
    await sheet(page).getByRole("switch", { name: "Coupled in Travelling" }).click();
    await expect(sheet(page)).toContainText("ticks are shared");
    await sheet(page).getByRole("button", { name: "Couple to 1" }).click();
    await expect(toast(page)).toContainText("Morning coupled with Travelling");
    await expect(page.getByRole("img", { name: "Coupled with 1 other Day Plan" })).toBeVisible();

    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("img", { name: "Coupled with 1 other Day Plan" })).toHaveCount(0);
  });

  test("decoupling warns it can't be undone before it happens", async ({ page }) => {
    await page.goto("/");
    await expect(headline(page)).toContainText("8 tasks left,");
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Couple with Day Plans…" }).click();
    await sheet(page).getByRole("switch", { name: "Coupled in Travelling" }).click();
    await sheet(page).getByRole("button", { name: "Couple to 1" }).click();
    await expect(toast(page)).toContainText("Morning coupled with Travelling");

    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Decouple from other Day Plans" }).click();
    await expect(sheet(page)).toContainText("This can't be undone.");
    await sheet(page).getByRole("button", { name: "Decouple from 1" }).click();
    // The coupling toast holds its Undo for 5 s; this one waits its turn.
    await expect(toast(page)).toContainText("Morning decoupled from Travelling", {
      timeout: 12_000,
    });
    await expect(page.getByRole("img", { name: "Coupled with 1 other Day Plan" })).toHaveCount(0);
    await expect(headline(page)).toContainText("8 tasks left,");
  });
});
