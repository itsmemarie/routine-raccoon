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
    await page.getByRole("alertdialog").getByRole("button", { name: "Only from Normal" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(headline(page)).toContainText("7 tasks left,");
    // One card shorter, so the page may end a little higher; never back at the top.
    await expect.poll(() => scrollY(page)).toBeGreaterThan(before - 150);
  });
});

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

/** Makes Morning one section in two plans: Normal (its first plan) and Travelling. */
async function shareMorningWithTravelling(page: Page) {
  await page.getByRole("button", { name: "Morning options" }).click();
  await page.getByRole("menuitem", { name: "Edit section" }).click();
  await page
    .getByRole("group", { name: "Coupled with" })
    .getByRole("button", { name: "Travelling" })
    .click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(headline(page)).toBeVisible();
}

async function addTaskToMorning(page: Page, name: string) {
  await page.getByRole("link", { name: "Add task to Morning" }).click();
  await page.getByPlaceholder("What is it?").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Morning" }).getByText(name)).toBeVisible();
}

test.describe("new tasks land where you are", () => {
  test("a section's + Add task creates in the Day Plan Today shows, not the section's first plan", async ({
    page,
  }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await pickTodayPlan(page, "Travelling");

    await page.getByRole("link", { name: "Add task to Morning" }).click();
    await expect(page.getByText("Travelling · Day Plan")).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Section", exact: true })
        .getByRole("button", { name: "Morning" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("Morning is also in Normal, so this task will show there too."),
    ).toBeVisible();
  });

  test("a task added in a copied section stays in that Day Plan", async ({ page }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Copy to Day Plan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Travelling" }).click();
    await expect(toast(page)).toContainText("Morning copied to Travelling");

    await pickTodayPlan(page, "Travelling");
    await addTaskToMorning(page, "Pack a bag");

    await pickTodayPlan(page, "Normal");
    await expect(headline(page)).toContainText("8 tasks left,");
    await expect(page.getByText("Pack a bag")).toHaveCount(0);
  });

  test("separating a shared section keeps today's ticks and stops new tasks spreading", async ({
    page,
  }) => {
    await openToday(page);
    await shareMorningWithTravelling(page);
    await page.getByRole("button", { name: "Tick Drink a pint" }).click();
    await expect(headline(page)).toContainText("7 tasks left,");

    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Decouple from other Day Plans" }).click();
    await page
      .getByTestId("coupling-sheet")
      .getByRole("button", { name: "Decouple from 1" })
      .click();
    await expect(toast(page)).toContainText("Morning decoupled from Travelling", {
      timeout: 8_000,
    });
    await expect(headline(page)).toContainText("7 tasks left,");

    await addTaskToMorning(page, "Pack a bag");
    await pickTodayPlan(page, "Travelling");
    await expect(page.getByRole("region", { name: "Morning" })).toBeVisible();
    await expect(page.getByText("Pack a bag")).toHaveCount(0);
  });

  test("the bottom Add task presets the section on screen", async ({ page }) => {
    await openToday(page);
    await scrollToBottom(page);
    await page.getByRole("link", { name: "Add task", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "New task", level: 1 })).toBeVisible();
    await expect(page.getByText("Normal · primary Day Plan")).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Section", exact: true })
        .getByRole("button", { name: "Evening" }),
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

  test("a web address in a note becomes a link that opens in a new tab; the note stays editable", async ({
    page,
    context,
  }) => {
    await context.route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
    await openToday(page);
    await page.getByRole("link", { name: /^Book the dentist/ }).click();
    await expect(page.getByRole("heading", { name: "Book the dentist", level: 1 })).toBeAttached();

    const notes = page.getByRole("textbox", { name: "Notes" });
    const link = page.getByRole("link", { name: "https://example.com/dentist" });
    await notes.fill("Book at https://example.com/dentist.");
    await notes.blur();
    await expect(link).toBeVisible();
    await expect(notes).toHaveCount(0);

    await page.reload();
    await expect(link).toBeVisible();

    const [opened] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await expect(opened).toHaveURL("https://example.com/dentist");
    await opened.close();
    // Opening the link leaves the note as it was.
    await expect(link).toBeVisible();

    await page.getByRole("button", { name: "Edit notes" }).click();
    await expect(notes).toBeFocused();
    await expect(notes).toHaveValue("Book at https://example.com/dentist.");
    await notes.fill("The number is on the fridge");
    await notes.blur();
    await expect(link).toHaveCount(0);
    await expect(notes).toHaveValue("The number is on the fridge");
  });

  test("editing a note with a long link keeps all of it in view", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: /^Book the dentist/ }).click();
    await expect(page.getByRole("heading", { name: "Book the dentist", level: 1 })).toBeAttached();

    const notes = page.getByRole("textbox", { name: "Notes" });
    await notes.fill(`Book at https://example.com/${"appointments/".repeat(8)} before noon`);
    await notes.blur();

    await page.getByRole("button", { name: "Edit notes" }).click();
    await expect(notes).toBeFocused();
    const hidden = await notes.evaluate((field) => field.scrollHeight - field.clientHeight);
    expect(hidden).toBeLessThanOrEqual(1);
  });
});

test.describe("Sticky Save appears when a task changes", () => {
  const saveBar = (page: Page) => page.getByTestId("save-bar");
  const openDentist = async (page: Page) => {
    await openToday(page);
    await page.getByRole("link", { name: /^Book the dentist/ }).click();
    await expect(page.getByRole("heading", { name: "Book the dentist", level: 1 })).toBeAttached();
  };
  // This task fits a full-height screen; a short one makes the page really scroll.
  const useShortScreen = (page: Page) => page.setViewportSize({ width: 412, height: 420 });

  test("Task detail: typing shows Save, it stays while scrolling, and Save stores the note", async ({
    page,
  }) => {
    await useShortScreen(page);
    await openDentist(page);
    await expect(saveBar(page)).toHaveCount(0);

    const notes = page.getByRole("textbox", { name: "Notes" });
    await notes.click();
    await expect(saveBar(page)).toHaveCount(0);
    await notes.fill("The number is on the fridge");
    await expect(saveBar(page)).toBeInViewport({ ratio: 1 });

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(saveBar(page)).toBeInViewport({ ratio: 1 });
    await scrollToBottom(page);
    await expect(saveBar(page)).toBeInViewport({ ratio: 1 });

    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("Saved");
    await page.reload();
    await expect(notes).toHaveValue("The number is on the fridge");
  });

  test("Task detail: leaving the field saves too, and undoing the typing hides the bar", async ({
    page,
  }) => {
    await openDentist(page);
    const notes = page.getByRole("textbox", { name: "Notes" });
    await notes.fill("Ask about Thursday");
    await expect(saveBar(page)).toBeVisible();
    await notes.fill("");
    await expect(saveBar(page)).toHaveCount(0);

    await notes.fill("Ask about Thursday");
    await notes.blur();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("Saved");

    await page.getByRole("button", { name: "Add subtask" }).click();
    const step = page.getByRole("textbox", { name: "New subtask" });
    await step.fill("Find the number");
    await expect(saveBar(page)).toBeVisible();
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Tick step: Find the number" })).toBeVisible();
  });

  test("the last buttons can scroll clear of the bar", async ({ page }) => {
    await useShortScreen(page);
    await openDentist(page);
    await page.getByRole("textbox", { name: "Notes" }).fill("Ask about Thursday");
    await scrollToBottom(page);

    const done = await page.getByRole("button", { name: "Done" }).boundingBox();
    const bar = await saveBar(page).boundingBox();
    expect(done && bar && done.y + done.height <= bar.y).toBe(true);
  });

  test("the bar rides above the on-screen keyboard", async ({ page }) => {
    await openDentist(page);
    await page.getByRole("textbox", { name: "Notes" }).fill("Ask about Thursday");
    // Headless Chromium has no on-screen keyboard: shrink the visual viewport the way one does.
    const keyboardTop = await page.evaluate(() => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error("visualViewport missing");
      const top = window.innerHeight - 320;
      Object.defineProperty(viewport, "height", { configurable: true, get: () => top });
      viewport.dispatchEvent(new Event("resize"));
      return top;
    });

    await expect
      .poll(async () => {
        const bar = await saveBar(page).boundingBox();
        return bar ? Math.round(bar.y + bar.height) : Number.NaN;
      })
      .toBe(keyboardTop);
  });

  test("the bar sits above a running timer, not on top of it", async ({ page }) => {
    await openDentist(page);
    await page.getByRole("button", { name: /^Start \d+ min$/ }).click();
    const timer = page.getByTestId("timer-bar");
    await expect(timer).toBeVisible();

    await page.getByRole("textbox", { name: "Notes" }).fill("Ask about Thursday");
    await expect(saveBar(page)).toBeVisible();
    await expect
      .poll(async () => {
        const bar = await saveBar(page).boundingBox();
        const below = await timer.boundingBox();
        return bar && below ? Math.round(bar.y + bar.height - below.y) : Number.NaN;
      })
      .toBeLessThanOrEqual(0);
  });

  test("Edit task: any change swaps the header Save for the sticky one", async ({ page }) => {
    await openDentist(page);
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit task", level: 1 })).toBeVisible();

    const save = page.getByRole("button", { name: "Save" });
    await expect(saveBar(page)).toHaveCount(0);
    await expect(save).toHaveCount(1);

    const name = page.getByRole("textbox", { name: "Task name" });
    await name.fill("Book the dentist today");
    await expect(saveBar(page)).toBeInViewport({ ratio: 1 });
    await expect(save).toHaveCount(1);

    await name.fill("Book the dentist");
    await expect(saveBar(page)).toHaveCount(0);

    // An icon on its own counts as a change too.
    await page.getByRole("button", { name: /^Icon .*, change$/ }).click();
    await page
      .getByTestId("emoji-picker")
      .getByRole("group", { name: "Icons" })
      .getByRole("button", { pressed: false })
      .first()
      .click();
    await expect(saveBar(page)).toBeVisible();

    await name.fill("Book the dentist today");
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/task\/\?id=/);
    await expect(toast(page)).toContainText("Saved");
    await expect(
      page.getByRole("heading", { name: "Book the dentist today", level: 1 }),
    ).toBeAttached();
  });

  test("New task: Save is there as soon as there is something to save", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: "Add task to Morning" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await page.getByRole("textbox", { name: "Task name" }).fill("Water the plants");
    await saveBar(page).getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page)).toContainText("Added to Morning");
  });
});
