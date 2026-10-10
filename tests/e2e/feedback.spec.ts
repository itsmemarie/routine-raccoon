import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Owner feedback from phone testing (Oct 2026), on the seeded demo routine (Tuesday 8 Sep
 * 2026, 8 tasks on Normal): Today keeps its place, new tasks land where you are, ticked tasks
 * can come back, and Task detail adds and reorders steps and notes in place.
 */

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
}

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function scrollToBottom(page: Page): Promise<number> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
  // The position is saved on the next animation frame.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  return scrollY(page);
}

test.describe("Today keeps its place", () => {
  test("deleting a task from its detail page returns to the same spot, not the top", async ({
    page,
  }) => {
    await openToday(page);
    const before = await scrollToBottom(page);
    await page.getByRole("link", { name: /^Tidy one surface/ }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete task" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(headline(page)).toContainText("7 tasks left,");
    // One card shorter, so the page may end a little higher; never back at the top.
    await expect.poll(() => scrollY(page)).toBeGreaterThan(before - 150);
  });
});

test.describe("new tasks land where you are", () => {
  test("a section's + Add task creates in the Day Plan Today shows, not the section's first plan", async ({
    page,
  }) => {
    await openToday(page);
    // Make Morning a shared section: Normal (its first plan) and Travelling.
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Copy to Day Plan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Travelling" }).click();
    await expect(toast(page)).toContainText("Morning copied to Travelling");

    await page.getByRole("button", { name: /Today's plan/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Travelling/ })
      .click();
    await expect(page.getByRole("button", { name: /Today's plan\s*Travelling/ })).toBeVisible();

    await page.getByRole("link", { name: "Add task to Morning" }).click();
    await expect(page.getByText("Travelling · Day Plan")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Section" }).getByRole("button", { name: "Morning" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the bottom Add task presets the section on screen", async ({ page }) => {
    await openToday(page);
    await scrollToBottom(page);
    await page.getByRole("link", { name: "Add task", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "New task", level: 1 })).toBeVisible();
    await expect(page.getByText("Normal · primary Day Plan")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Section" }).getByRole("button", { name: "Evening" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("ticked tasks can come back", () => {
  test("after the undo window, a section's 'N done' row lists the task and un-ticks it", async ({
    page,
  }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Tick Drink a pint" }).click();
    await expect(toast(page).getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(toast(page)).toBeHidden({ timeout: 7_000 });

    const morning = page.getByRole("region", { name: "Morning" });
    await expect(morning.getByRole("button", { name: "Un-tick Drink a pint" })).toHaveCount(0);
    await morning.getByRole("button", { name: "1 done" }).click();
    await morning.getByRole("button", { name: "Un-tick Drink a pint" }).click();

    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(morning.getByRole("button", { name: "Tick Drink a pint" })).toBeVisible();
    await expect(morning.getByRole("button", { name: "1 done" })).toHaveCount(0);
  });
});

test.describe("Task detail adds and reorders in place", () => {
  test("a note and steps go in with one tap each; steps reorder and it all persists", async ({
    page,
  }) => {
    await openToday(page);
    await page.getByRole("link", { name: /^Book the dentist/ }).click();
    await expect(page.getByRole("heading", { name: "Book the dentist", level: 1 })).toBeAttached();

    const notes = page.getByRole("textbox", { name: "Notes" });
    await expect(notes).toHaveAttribute("placeholder", "Add a note");
    await notes.click();
    await notes.fill("The number is on the fridge");
    await notes.blur();

    await page.getByRole("button", { name: "Add subtask" }).click();
    const field = page.getByRole("textbox", { name: "New subtask" });
    await field.fill("Find the number");
    await field.press("Enter");
    // Enter adds the step and keeps the field open for the next one.
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();
    await field.fill("Call before noon");
    await field.press("Enter");
    await field.blur();

    const steps = page.getByRole("list", { name: "Steps" }).getByRole("checkbox");
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toHaveAccessibleName("Tick step: Find the number");

    await page.getByRole("button", { name: "Move Call before noon" }).focus();
    const said = (text: string) => expect(page.getByText(text, { exact: true })).toBeAttached();
    await page.keyboard.press("Space");
    await said("Picked up Call before noon.");
    await page.keyboard.press("ArrowUp");
    await said("Call before noon is over Find the number.");
    await page.keyboard.press("Space");
    await said("Call before noon dropped at Find the number's place.");
    await expect(steps.nth(0)).toHaveAccessibleName("Tick step: Call before noon");

    await page.reload();
    await expect(steps.nth(0)).toHaveAccessibleName("Tick step: Call before noon");
    await expect(steps.nth(1)).toHaveAccessibleName("Tick step: Find the number");
    await expect(notes).toHaveValue("The number is on the fridge");
  });
});
