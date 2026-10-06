import type { Page } from "@playwright/test";
import { FIXED_NOW, expect, test } from "./fixtures";

/**
 * End-to-end flows across screens, on the seeded demo routine (Tuesday 8 Sep 2026, 8 tasks on
 * Normal). Each test starts from a fresh browser context, so a fresh seed.
 */

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("8 tasks left,");
}

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");

test.describe("tasks", () => {
  test("add a task to a section: it shows on Today and in the Log", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: "Add task to Smash it" }).click();
    await expect(page.getByRole("heading", { name: "New task", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Section" }).getByRole("button", { name: "Smash it" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("textbox", { name: "Task name" }).fill("Call the bank");
    await page
      .getByRole("region", { name: "Estimated time" })
      .getByRole("button", { name: "5 min", exact: true })
      .click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page)).toContainText("Added to Smash it");
    await expect(headline(page)).toContainText("9 tasks left,");
    await expect(
      page
        .getByRole("region", { name: "Smash it" })
        .getByRole("button", { name: "Tick Call the bank" }),
    ).toBeVisible();

    await page.goto("/log/");
    await page.getByRole("button", { name: "Added", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Call the bank" })).toHaveCount(1);
  });

  test("saving without a name shows the input error with its code, and nothing is added", async ({
    page,
  }) => {
    await page.goto("/task/edit/");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator('[data-error-code="RR-VAL-001"][data-page-id="P03"]')).toBeVisible();
    await expect(page).toHaveURL(/\/task\/edit\/$/);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");
  });

  test("pasting a list adds one task per line", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: "Add task to Morning" }).click();
    const name = page.getByRole("textbox", { name: "Task name" });
    await name.evaluate((input) => {
      const data = new DataTransfer();
      data.setData("text", "Water the plants\nOpen the post\nTake vitamins");
      input.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    const dialog = page.getByRole("dialog", { name: "Add 3 tasks?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add 3 tasks" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(headline(page)).toContainText("11 tasks left,");
    const morning = page.getByRole("region", { name: "Morning" });
    for (const task of ["Water the plants", "Open the post", "Take vitamins"]) {
      await expect(morning.getByRole("button", { name: `Tick ${task}` })).toBeVisible();
    }
  });

  test("Task detail: Done ticks it and returns to Today; Undo puts it back", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: /^Book the dentist/ }).click();
    await expect(page.getByRole("heading", { name: "Book the dentist", level: 1 })).toBeAttached();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(headline(page)).toContainText("7 tasks left,");
    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");
  });

  test("Skip today takes a task off today's list", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: /^Tidy one surface/ }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Skip today" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page)).toContainText("Skipped Tidy one surface for today");
    await expect(page.getByRole("button", { name: "Tick Tidy one surface" })).toHaveCount(0);
  });
});

test.describe("sections and Day Plans", () => {
  test("add a section to Normal: it shows on Today", async ({ page }) => {
    await openToday(page);
    await page.getByRole("link", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { name: "Add section", level: 1 })).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("Lunch");
    await page.getByRole("group", { name: "Colour" }).getByRole("button", { name: "Blue" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("region", { name: "Lunch" })).toBeVisible();
    await expect(headline(page)).toContainText("8 tasks left,");
  });

  test("archive a section from its menu, then restore it from Archive", async ({ page }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Evening options" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    const confirm = page.getByRole("dialog");
    if (await confirm.isVisible()) {
      await confirm.getByRole("button", { name: /Archive/ }).click();
    }
    await expect(page.getByRole("region", { name: "Evening" })).toHaveCount(0);
    await expect(headline(page)).toContainText("6 tasks left,");

    await page.goto("/archive/");
    await page.getByRole("button", { name: "Restore Evening" }).click();
    await expect(toast(page)).toContainText("Evening restored");
    await expect(page.getByText("No archived sections")).toBeVisible();
    await openToday(page);
    await expect(page.getByRole("region", { name: "Evening" })).toBeVisible();
  });

  test("reordering Day Plans persists across a reload", async ({ page }) => {
    await page.goto("/settings/");
    const plans = page.getByRole("list", { name: "Day Plans" }).getByRole("listitem");
    await expect(plans.last()).toContainText("Travelling");
    await page.getByRole("button", { name: "Move Travelling up" }).click();
    await expect(plans.nth(3)).toContainText("Travelling");
    await page.reload();
    await expect(plans.nth(3)).toContainText("Travelling");
    await expect(plans.last()).toContainText("Zero energy");
  });

  test("plan cards name the plan they act on", async ({ page }) => {
    await page.goto("/settings/");
    await page.getByRole("button", { name: "More for Travelling" }).click();
    await expect(page.getByRole("button", { name: "More for Travelling" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByRole("link", { name: "Sections in Normal" }).click();
    await expect(page.getByRole("list", { name: "Sections in Normal" })).toBeVisible();
  });
});

test.describe("the day", () => {
  test("Progress and the Log follow a tick", async ({ page }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Tick Drink a pint" }).click();
    await expect(headline(page)).toContainText("7 tasks left,");

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Progress" })
      .click();
    await expect(
      page.getByRole("listitem", { name: "Tue 8 Sep: today, 1 of 8 ticked so far" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Drink a pint\s*1 of 1 day/ })).toBeVisible();

    await page.goto("/log/");
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Completed Drink a pint" }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Added", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Drink a pint" })).toHaveCount(0);
  });

  test("closing the day starts tomorrow's list", async ({ page }) => {
    await page.goto("/day-complete/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      "Calling it a day? 8 still open.",
    );
    await page.getByRole("button", { name: "Close the day" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page)).toContainText("Day closed. Fresh list.");
    // Wednesday adds Prepare dinner (Mon/Wed/Fri).
    await expect(page.getByText("Wednesday 9 September")).toBeVisible();
    await expect(headline(page)).toContainText("9 tasks left,");
  });

  test("Settings changes persist across a reload", async ({ page }) => {
    await page.goto("/settings/");
    const roll = page.getByRole("switch", { name: "Roll unfinished tasks over" });
    await expect(roll).not.toBeChecked();
    await roll.click();
    await expect(roll).toBeChecked();

    await page.getByRole("button", { name: /Day resets at/ }).click();
    const sheet = page.getByRole("dialog", { name: "Day resets at" });
    await sheet.getByRole("button", { name: "4:00 AM" }).click();
    await sheet.getByRole("button", { name: "Set 4:00 AM" }).click();
    await expect(page.getByRole("button", { name: /Day resets at 4:00 AM/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Roll unfinished tasks over" })).toBeChecked();
    await expect(page.getByRole("button", { name: /Day resets at 4:00 AM/ })).toBeVisible();
  });

  test("Export all data saves a JSON file with the routine in it", async ({ page }) => {
    // Desktop Chromium may offer the share sheet; exercise the download path.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "canShare", { value: undefined });
    });
    await page.goto("/settings/");
    await page.getByRole("button", { name: /Export all data/ }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("dialog", { name: "Export all data" })
      .getByRole("button", { name: /Everything/ })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("routine-raccoon-2026-09-08.json");
    const path = await file.path();
    const { readFile } = await import("node:fs/promises");
    const json = JSON.parse(await readFile(path, "utf8")) as {
      app: { name: string };
      tasks: { name: string }[];
    };
    expect(json.app.name).toBe("Routine Raccoon");
    expect(json.tasks.map((t) => t.name)).toContain("Drink a pint");
  });
});

test.describe("setup", () => {
  test("five questions turn something avoided into a hard task with a first step", async ({
    page,
  }) => {
    await page.goto("/setup/");
    await page.getByRole("textbox", { name: "What am I avoiding?" }).fill("Renew the passport");
    await page.getByRole("button", { name: "Next" }).click();
    // An optional question with no answer offers Skip.
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("textbox", { name: "What's the smaller version?" }).fill("Find the form");
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByRole("textbox", { name: "What's the first physical action?" })
      .fill("Open the website");
    await page.getByRole("button", { name: "Next" }).click();
    await page
      .getByRole("group", { name: "Minutes" })
      .getByRole("button", { name: "5 min", exact: true })
      .click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { name: "Here's your first step" })).toBeVisible();
    await expect(page.getByText("First step: Open the website")).toBeVisible();
    await page.getByRole("button", { name: "Add to my day" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(toast(page)).toContainText("Added to Morning");
    await expect(headline(page)).toContainText("9 tasks left,");
    await page.getByRole("link", { name: /^Renew the passport/ }).click();
    await expect(page.getByRole("checkbox", { name: "Tick step: Open the website" })).toBeVisible();
  });

  test("the first question can't be skipped", async ({ page }) => {
    await page.goto("/setup/");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator('[data-error-code="RR-VAL-001"][data-page-id="P15"]')).toBeVisible();
    await expect(page.getByText("1 of 6")).toBeVisible();
  });
});

test.describe("on the card", () => {
  test("keyboard drag: a task moves down its section and stays there after a reload", async ({
    page,
  }) => {
    await openToday(page);
    const morningTasks = page
      .getByRole("region", { name: "Morning" })
      .getByRole("button", { name: /^Tick / });
    await expect(morningTasks.first()).toHaveAccessibleName("Tick Drink a pint");
    await page.getByRole("button", { name: "Move Drink a pint" }).focus();
    // Each step waits for its screen-reader announcement (dnd-kit measures between keys).
    const said = (text: string) => expect(page.getByText(text, { exact: true })).toBeAttached();
    await page.keyboard.press("Space");
    await said("Picked up Drink a pint.");
    await page.keyboard.press("ArrowDown");
    await said("Drink a pint is over Morning.");
    await page.keyboard.press("Space");
    await said("Drink a pint dropped in Morning.");
    await expect(morningTasks.nth(1)).toHaveAccessibleName("Tick Drink a pint");
    await page.reload();
    await expect(morningTasks.first()).toHaveAccessibleName("Tick Eat something");
    await expect(morningTasks.nth(1)).toHaveAccessibleName("Tick Drink a pint");
  });

  test("timer: counts down, says when time's up, and Tick it completes the task", async ({
    page,
  }) => {
    await openToday(page);
    await page.getByRole("button", { name: "Start a 2 minute timer for Drink a pint" }).click();
    const bar = page.getByTestId("timer-bar");
    await expect(bar).toContainText("Drink a pint");
    await expect(bar).toContainText("2:00");
    await expect(bar.getByRole("button", { name: "Stop timer for Drink a pint" })).toBeVisible();

    await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 3 * 60_000));
    await expect(bar).toContainText("Time's up");
    await bar.getByRole("button", { name: "Tick it" }).click();
    await expect(bar).toBeHidden();
    await expect(toast(page)).toContainText("Ticked Drink a pint");
    await expect(headline(page)).toContainText("7 tasks left,");
  });
});
