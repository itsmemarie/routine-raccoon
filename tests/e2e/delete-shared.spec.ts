import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Owner request (Nov 2026): deleting a task that's in several Day Plans asks where, this plan or
 * all of them. On the seeded demo routine (Tuesday 8 Sep 2026, 8 tasks on Normal): "Book the
 * dentist" is in Normal only; "Drink a pint" has copies in the three survival plans.
 */

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");
const dialog = (page: Page) => page.getByRole("alertdialog");
const card = (page: Page, name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) });

async function openToday(page: Page) {
  await page.goto("/");
  await expect(headline(page)).toContainText("8 tasks left,");
}

/** Links Morning into a second plan, as a section shared on purpose through "Also in". */
async function shareMorningWithTravelling(page: Page) {
  await page.getByRole("button", { name: "Morning options" }).click();
  await page.getByRole("menuitem", { name: "Edit section" }).click();
  // Today can show a plan picker of its own: wait for the form so this lands on "Also in".
  await expect(page.getByRole("heading", { name: "Edit section", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Travelling" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(headline(page)).toContainText("8 tasks left,");
}

async function switchPlan(page: Page, name: string) {
  await page.getByRole("button", { name: /Today's plan/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(`Today's plan\\s*${name}`) }),
  ).toBeVisible();
}

async function askToDelete(page: Page, name: string) {
  await card(page, name).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
}

test.describe("deleting a task that's in several plans", () => {
  test("a task in one plan just asks to confirm", async ({ page }) => {
    await openToday(page);
    await askToDelete(page, "Book the dentist");
    await expect(dialog(page)).toContainText("removed for good");
    await expect(dialog(page).getByRole("button", { name: /Only from/ })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Delete task" }).click();
    await expect(headline(page)).toContainText("7 tasks left,");
    await expect(toast(page)).toContainText("Deleted Book the dentist");
  });

  test("Only from this plan: gone here, still in the other plan", async ({ page }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await askToDelete(page, "Eat something");

    await expect(dialog(page)).toContainText("Normal");
    await expect(dialog(page)).toContainText("Travelling");
    await dialog(page).getByRole("button", { name: "Only from Normal" }).click();

    await expect(toast(page)).toContainText("Removed Eat something from Normal");
    await expect(headline(page)).toContainText("7 tasks left,");
    await expect(card(page, "Eat something")).toHaveCount(0);

    await switchPlan(page, "Travelling");
    await expect(card(page, "Eat something")).toBeVisible();
    await expect(card(page, "Drink a pint")).toBeVisible();
  });

  test("the plan offered is the one Today is showing", async ({ page }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await switchPlan(page, "Travelling");
    await askToDelete(page, "Eat something");
    await dialog(page).getByRole("button", { name: "Only from Travelling" }).click();

    await expect(card(page, "Eat something")).toHaveCount(0);
    await switchPlan(page, "Normal");
    await expect(card(page, "Eat something")).toBeVisible();
  });

  test("From all plans: gone everywhere, copies included", async ({ page }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await askToDelete(page, "Drink a pint");

    await dialog(page).getByRole("button", { name: "From all 5 plans" }).click();

    await expect(toast(page)).toContainText("Deleted Drink a pint from 5 plans");
    await expect(card(page, "Drink a pint")).toHaveCount(0);
    await switchPlan(page, "Travelling");
    await expect(card(page, "Drink a pint")).toHaveCount(0);
    await expect(card(page, "Eat something")).toBeVisible();
  });

  test("the Edit task screen asks the same, and Cancel keeps the task", async ({ page }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await card(page, "Eat something").click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Delete task" }).click();

    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Delete task" }).click();
    await dialog(page).getByRole("button", { name: "Only from Normal" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(headline(page)).toContainText("7 tasks left,");
    await switchPlan(page, "Travelling");
    await expect(card(page, "Eat something")).toBeVisible();
  });

  test("a removed task can be brought back with Also add to", async ({ page }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await askToDelete(page, "Straighten your back");
    await dialog(page).getByRole("button", { name: "Only from Normal" }).click();
    await expect(headline(page)).toContainText("7 tasks left,");

    await switchPlan(page, "Travelling");
    await card(page, "Straighten your back").click();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Normal" }).click();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("heading", { name: "Edit task" })).toHaveCount(0);

    await page.goto("/");
    await switchPlan(page, "Normal");
    await expect(card(page, "Straighten your back")).toBeVisible();
    await expect(card(page, "Straighten your back")).toHaveCount(1);
  });
});
