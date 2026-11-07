import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * "Also add to" on the task form, on the seeded demo routine (Tuesday 8 Sep 2026, 8 tasks on
 * Normal across Morning, Smash it, Evening and Wind down): a task goes to any section of the
 * current plan and to any other Day Plan, and each copy is its own task.
 * @see docs/handoff/README.md "Task copies"
 */

const headline = (page: Page) => page.getByRole("heading", { level: 1 });
const toast = (page: Page) => page.getByTestId("toast");
const sectionField = (page: Page) => page.getByRole("group", { name: "Section", exact: true });
const otherSections = (page: Page, plan: string) =>
  page.getByRole("group", { name: `Other sections in ${plan}` });
const otherPlans = (page: Page) => page.getByRole("group", { name: "Other Day Plans" });

async function newTaskInMorning(page: Page, name: string) {
  await page.goto("/");
  await expect(headline(page)).toContainText("8 tasks left,");
  await page.getByRole("link", { name: "Add task to Morning" }).click();
  await page.getByRole("textbox", { name: "Task name" }).fill(name);
}

test.describe("Also add to", () => {
  test("drinking water goes in every section and a plan the user made, as separate tasks", async ({
    page,
  }) => {
    await newTaskInMorning(page, "Drink water");
    const sections = otherSections(page, "Normal");
    await sections.getByRole("button", { name: "All sections" }).click();
    await expect(sections.getByRole("button", { name: "Evening" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await otherPlans(page).getByRole("button", { name: "Travelling" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(toast(page)).toContainText("Added to Morning · copied to 4 places");
    // Three more today: Wind down has a copy too, but only runs Friday to Sunday.
    await expect(headline(page)).toContainText("11 tasks left,");

    await page
      .getByRole("region", { name: "Morning" })
      .getByRole("button", { name: "Tick Drink water" })
      .click();
    await expect(headline(page)).toContainText("10 tasks left,");
    for (const section of ["Smash it", "Evening"]) {
      await expect(
        page
          .getByRole("region", { name: section })
          .getByRole("button", { name: "Tick Drink water" }),
      ).toBeVisible();
    }

    await page.getByRole("button", { name: /Today's plan/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Travelling/ })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Before leaving" })
        .getByRole("button", { name: "Tick Drink water" }),
    ).toBeVisible();
  });

  test("offers every other plan, not only survival plans", async ({ page }) => {
    await newTaskInMorning(page, "Stretch");
    for (const plan of ["Travelling", "Bare minimum", "Bad day", "Zero energy"]) {
      await expect(otherPlans(page).getByRole("button", { name: plan })).toBeVisible();
    }
    await expect(otherPlans(page).getByRole("button", { name: "Normal" })).toHaveCount(0);

    // Only Survival Mode shrinks a task, so the smaller time is only promised for those plans.
    const shrinkHint = page.getByText(/plans it shows at about 8 min/);
    await otherPlans(page).getByRole("button", { name: "Travelling" }).click();
    await expect(shrinkHint).toHaveCount(0);
    await otherPlans(page).getByRole("button", { name: "Bad day" }).click();
    await expect(shrinkHint).toBeVisible();
  });

  test("picks follow the section and plan the task is in", async ({ page }) => {
    await newTaskInMorning(page, "Stretch");
    const evening = otherSections(page, "Normal").getByRole("button", { name: "Evening" });

    // A picked section that becomes the task's own section stops being a copy.
    await evening.click();
    await sectionField(page).getByRole("button", { name: "Evening" }).click();
    await expect(evening).toHaveCount(0);
    await sectionField(page).getByRole("button", { name: "Morning" }).click();
    await expect(evening).toHaveAttribute("aria-pressed", "false");

    // Section picks belong to the plan they were made in.
    await evening.click();
    await otherPlans(page).getByRole("button", { name: "Bad day" }).click();
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bad day" }).click();
    await expect(
      otherSections(page, "Bad day").getByRole("button", { name: "Evening" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(otherPlans(page).getByRole("button", { name: "Bad day" })).toHaveCount(0);
    await expect(otherPlans(page).getByRole("button", { name: "Normal" })).toBeVisible();
  });

  test("the toast names up to three places", async ({ page }) => {
    await newTaskInMorning(page, "Stretch");
    await otherSections(page, "Normal").getByRole("button", { name: "Evening" }).click();
    await otherPlans(page).getByRole("button", { name: "Travelling" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(toast(page)).toContainText("Added to Morning · copied to Evening, Travelling");
  });

  test("a plan already showing the task through a shared section isn't offered", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Morning options" }).click();
    await page.getByRole("menuitem", { name: "Edit section" }).click();
    await page
      .getByRole("group", { name: "Also in" })
      .getByRole("button", { name: "Travelling" })
      .click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(headline(page)).toContainText("8 tasks left,");

    await page.getByRole("link", { name: /^Drink a pint/ }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit task" }).click();
    await expect(page.getByRole("heading", { name: "Edit task", level: 1 })).toBeVisible();
    await expect(otherPlans(page).getByRole("button", { name: "Travelling" })).toHaveCount(0);
    await expect(
      page.getByText("Morning is also in Travelling, so this task already shows there."),
    ).toBeVisible();
  });
});
