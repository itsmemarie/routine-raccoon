// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppError } from "@/lib/errors/app-error";
import { DeleteAccountDialog } from "./delete-account-dialog";

function setup(props: Partial<Parameters<typeof DeleteAccountDialog>[0]> = {}) {
  const handlers = { onConfirm: vi.fn(), onSignInAgain: vi.fn(), onCancel: vi.fn() };
  render(
    <DeleteAccountDialog
      email="leo@example.com"
      pageId="P14"
      busy={false}
      error={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("DeleteAccountDialog", () => {
  it("says the shared login goes too, and only deletes once DELETE is typed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    expect(screen.getByRole("alertdialog", { name: "Delete your account?" })).toHaveTextContent(
      "Your login, leo@example.com, is deleted. It's shared with your other apps",
    );
    const button = screen.getByRole("button", { name: "Delete account and login" });
    const field = screen.getByRole("textbox", { name: "Type DELETE to confirm" });
    expect(button).toBeDisabled();

    await user.type(field, "delet{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button).toBeDisabled();

    await user.type(field, "e ");
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows the error with its code; a stale session offers Sign in again instead", async () => {
    const user = userEvent.setup();
    const { onConfirm, onSignInAgain } = setup({ error: new AppError("RR-AUTH-012") });
    expect(screen.getByTestId("inline-error")).toHaveTextContent("RR-AUTH-012 · P14");
    expect(screen.queryByRole("button", { name: "Delete account and login" })).toBeNull();
    await user.type(
      screen.getByRole("textbox", { name: "Type DELETE to confirm" }),
      "DELETE{Enter}",
    );
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(onSignInAgain).toHaveBeenCalledTimes(1);
  });

  it("can't be cancelled or resubmitted while deleting", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup({ busy: true });
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
