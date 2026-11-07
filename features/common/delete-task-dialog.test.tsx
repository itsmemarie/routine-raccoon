// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteTask, removeTaskFromPlan } from "@/data/commands/tasks";
import type { TaskPlacement } from "@/domain/organise";
import { AppError } from "@/lib/errors/app-error";
import { err, ok } from "@/lib/errors/result";
import { plan } from "@/tests/factories";
import { DeleteTaskDialog } from "./delete-task-dialog";

vi.mock("@/data/commands/context", () => ({ defaultContext: () => ({}) }));
vi.mock("@/data/commands/tasks", () => ({ deleteTask: vi.fn(), removeTaskFromPlan: vi.fn() }));

const normal = plan({ name: "Normal" });
const travel = plan({ name: "Travel", kind: "custom" });
const away = plan({ name: "Away", kind: "custom" });
const task = { id: "t1", name: "Breakfast" };

function placed(current: TaskPlacement["current"], plans: TaskPlacement["plans"]): TaskPlacement {
  return { current, plans, copies: [] };
}

function setup(placement: TaskPlacement) {
  const handlers = { onCancel: vi.fn(), onStart: vi.fn(), onFinish: vi.fn() };
  render(<DeleteTaskDialog pageId="P02" task={task} placement={placement} {...handlers} />);
  return handlers;
}

const button = (name: string) => screen.getByRole("button", { name });

describe("DeleteTaskDialog", () => {
  beforeEach(() => {
    vi.mocked(deleteTask).mockReset().mockResolvedValue(ok(undefined));
    vi.mocked(removeTaskFromPlan).mockReset().mockResolvedValue(ok(undefined));
  });

  it("a task in one plan gets the plain confirm, with no choice to make", async () => {
    const { onFinish } = setup(placed(normal, [normal]));
    expect(
      screen.getByRole("alertdialog", { name: "Delete “Breakfast”?" }),
    ).toHaveAccessibleDescription(
      "The task and its steps are removed for good. You can skip it for today instead.",
    );
    expect(screen.queryByRole("button", { name: /Only from/ })).toBeNull();
    await userEvent.click(button("Delete task"));
    expect(deleteTask).toHaveBeenCalledWith({}, { taskId: "t1" });
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("a task in two plans offers this plan or both", async () => {
    setup(placed(normal, [normal, travel]));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "It's in Normal and Travel. Deleting it from both removes it and its steps for good. You can skip it for today instead.",
    );
    expect(button("Only from Normal")).toBeVisible();
    expect(button("From both plans")).toBeVisible();
  });

  it("a task in three plans counts them", () => {
    setup(placed(travel, [normal, travel, away]));
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "It's in Normal, Travel and Away. Deleting it from all of them removes it and its steps for good. You can skip it for today instead.",
    );
    expect(button("Only from Travel")).toBeVisible();
    expect(button("From all 3 plans")).toBeVisible();
  });

  it("Only from {plan} removes it from that plan alone", async () => {
    const { onStart, onFinish } = setup(placed(travel, [normal, travel]));
    await userEvent.click(button("Only from Travel"));
    expect(removeTaskFromPlan).toHaveBeenCalledWith({}, { taskId: "t1", planId: travel.id });
    expect(deleteTask).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("From all plans deletes it everywhere", async () => {
    const { onFinish } = setup(placed(normal, [normal, travel, away]));
    await userEvent.click(button("From all 3 plans"));
    expect(deleteTask).toHaveBeenCalledWith({}, { taskId: "t1" });
    expect(removeTaskFromPlan).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("tells the caller when the command failed, so it can stay put", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(removeTaskFromPlan).mockResolvedValue(err(new AppError("RR-DB-002")));
    const { onFinish } = setup(placed(normal, [normal, travel]));
    await userEvent.click(button("Only from Normal"));
    expect(onFinish).toHaveBeenCalledWith(false);
  });

  it("Cancel does nothing", async () => {
    const { onCancel, onStart } = setup(placed(normal, [normal, travel]));
    await userEvent.click(button("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
    expect(removeTaskFromPlan).not.toHaveBeenCalled();
  });

  it("with no plan to act on, falls back to the plain confirm", () => {
    setup(placed(null, [normal, travel]));
    expect(button("Delete task")).toBeVisible();
  });
});
