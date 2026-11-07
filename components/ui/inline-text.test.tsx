// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineText } from "./inline-text";

describe("InlineText when the screen goes away mid-typing", () => {
  it("commits what was typed, as the phone's back gesture removes the field without a blur", async () => {
    const onCommit = vi.fn();
    const view = render(<InlineText value="" label="Notes" multiline onCommit={onCommit} />);
    await userEvent.type(screen.getByLabelText("Notes"), "Ring them back");
    view.unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Ring them back");
  });

  it("commits nothing when the text is unchanged, cancelled or already committed", async () => {
    const onCommit = vi.fn();
    const view = render(<InlineText value="Pint" label="Task name" onCommit={onCommit} />);
    const input = screen.getByLabelText("Task name");
    await userEvent.click(input);
    await userEvent.type(input, " oops");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(input);
    await userEvent.type(input, "s{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
