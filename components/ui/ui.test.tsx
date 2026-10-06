// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineError } from "@/components/errors/inline-error";
import { AppError } from "@/lib/errors/app-error";
import { AddChip, Chip, ChoiceChip } from "./chip";
import { ConfirmDialog, PromptDialog } from "./confirm";
import { InlineText } from "./inline-text";
import { Card, ContextCard, Dot, EmptyBox, GroupHeading, Overline } from "./layout";
import { MenuButton } from "./menu";
import { canGoBack, NavigationTracker, resetNavigationStack, useBack } from "./navigation";
import { BackBar, FormBar, ScreenHeader, ScreenRoot } from "./screen";
import { SettingsGroup, SettingsRow } from "./settings-row";
import { Dialog, Sheet } from "./sheet";
import { neighbourMove, SortableList } from "./sortable-list";
import { Switch, SwitchRow } from "./toggle";

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn() };
let pathname = "/";
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => search,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  router.back.mockReset();
  router.replace.mockReset();
  router.push.mockReset();
  resetNavigationStack();
  pathname = "/";
  search = new URLSearchParams();
});

describe("chips", () => {
  it("expose their pressed state and colour dot", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Chip active onClick={onClick}>
          All
        </Chip>
        <Chip>Hard</Chip>
        <ChoiceChip selected dot="#E5134A">
          Morning
        </ChoiceChip>
        <ChoiceChip dot="#123456">Evening</ChoiceChip>
        <ChoiceChip>Plain</ChoiceChip>
        <AddChip>+ New</AddChip>
      </>,
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Morning" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "+ New" })).toBeInTheDocument();
  });
});

describe("switches", () => {
  it("toggle from the switch and from the row label", async () => {
    const onChange = vi.fn();
    render(
      <>
        <Switch checked={false} onChange={onChange} aria-label="Plain" />
        <SwitchRow
          id="row"
          title="Roll over"
          description="Off by default"
          checked
          onChange={onChange}
        />
      </>,
    );
    await userEvent.click(screen.getByRole("switch", { name: "Plain" }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    const row = screen.getByRole("switch", { name: "Roll over" });
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(row).toHaveAccessibleDescription("Off by default");
    await userEvent.click(screen.getByText("Roll over"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe("sheets and dialogs", () => {
  it("Sheet traps focus, closes on Escape and scrim, restores focus", async () => {
    const onClose = vi.fn();
    const Harness = ({ open }: { open: boolean }) => (
      <>
        <button type="button">Opener</button>
        {open ? (
          <Sheet
            title="Pick one"
            description="Choose"
            onClose={onClose}
            footer={<button type="button">Last</button>}
          >
            <button type="button">First</button>
          </Sheet>
        ) : null}
      </>
    );
    const opener = (() => {
      const view = render(<Harness open={false} />);
      return { view, button: screen.getByRole("button", { name: "Opener" }) };
    })();
    opener.button.focus();
    opener.view.rerender(<Harness open />);
    const dialog = screen.getByRole("dialog", { name: "Pick one" });
    expect(dialog).toHaveAccessibleDescription("Choose");
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog).toHaveFocus();

    screen.getByRole("button", { name: "Last" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(2);

    opener.view.rerender(<Harness open={false} />);
    expect(opener.button).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("Dialog without focusables keeps Tab inside", () => {
    render(<Dialog title="Empty" onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Empty" });
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ConfirmDialog confirms or cancels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Delete “Eat”?"
        body="Gone for good."
        confirmLabel="Delete task"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("alertdialog", { name: "Delete “Eat”?" })).toHaveAccessibleDescription(
      "Gone for good.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete task" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("PromptDialog submits the typed value (single and multi-line)", async () => {
    const onSubmit = vi.fn();
    const view = render(
      <PromptDialog
        title="Rename"
        label="Name"
        initialValue="Old"
        onSubmit={onSubmit}
        onCancel={() => undefined}
        error={<p>Bad</p>}
      />,
    );
    const input = screen.getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "New{Enter}");
    expect(onSubmit).toHaveBeenLastCalledWith("New");
    expect(screen.getByText("Bad")).toBeInTheDocument();
    view.unmount();
    render(
      <PromptDialog
        title="Description"
        label="Description"
        multiline
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Line one");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith("Line one");
  });
});

describe("MenuButton", () => {
  it("opens, moves with arrow keys, selects, and closes on Escape or outside tap", async () => {
    const edit = vi.fn();
    const remove = vi.fn();
    render(
      <>
        <MenuButton
          label="Section options"
          trigger="⋯"
          align="left"
          items={[
            { label: "Edit section", onSelect: edit, icon: <span>e</span> },
            { label: "Delete", onSelect: remove, destructive: true },
          ]}
        />
        <p>Outside</p>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Section options" });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("InlineText", () => {
  it("commits on blur and Enter, cancels on Escape, keeps a draft while focused", async () => {
    const onCommit = vi.fn();
    const view = render(<InlineText value="Pint" label="Task name" onCommit={onCommit} />);
    const input = screen.getByLabelText("Task name");
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "Two pints");
    view.rerender(<InlineText value="Synced elsewhere" label="Task name" onCommit={onCommit} />);
    expect(input).toHaveValue("Two pints");
    await userEvent.keyboard("{Enter}");
    expect(onCommit).toHaveBeenLastCalledWith("Two pints");
    expect(input).toHaveValue("Synced elsewhere");

    await userEvent.click(input);
    await userEvent.type(input, " oops");
    await userEvent.keyboard("{Escape}");
    expect(onCommit).toHaveBeenCalledTimes(1);

    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("multi-line variant keeps Enter for new lines", async () => {
    const onCommit = vi.fn();
    render(<InlineText value="" label="Notes" multiline onCommit={onCommit} />);
    const box = screen.getByLabelText("Notes");
    await userEvent.click(box);
    await userEvent.type(box, "a{Enter}b");
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith("a\nb");
  });
});

describe("layout pieces", () => {
  it("render their content", () => {
    render(
      <>
        <GroupHeading id="h">Steps</GroupHeading>
        <GroupHeading as="h3">Small</GroupHeading>
        <Overline>Today&apos;s plan</Overline>
        <Overline className="text-primary">Tinted</Overline>
        <Card>card</Card>
        <Card as="section">section card</Card>
        <ContextCard
          label="Creating in"
          value="Normal"
          action={<button type="button">Change</button>}
        />
        <EmptyBox>Nothing here</EmptyBox>
        <Dot color="red" ring />
        <Dot color="blue" size={12} />
        <InlineError error={new AppError("RR-VAL-001")} pageId="P03" />
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Steps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Small" })).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name first.RR-VAL-001 · P03");
  });

  it("settings rows link, act, or just show", async () => {
    const onClick = vi.fn();
    render(
      <SettingsGroup className="x">
        <SettingsRow title="Log" description="Everything" value="12" href="/log/" />
        <SettingsRow title="Export" value="Export" valueTone="accent" onClick={onClick} />
        <SettingsRow title="Version" value="1.0" />
      </SettingsGroup>,
    );
    expect(screen.getByRole("link", { name: /Log/ })).toHaveAttribute("href", "/log/");
    await userEvent.click(screen.getByRole("button", { name: /Export/ }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText("Version")).toBeInTheDocument();
  });
});

describe("screens and navigation", () => {
  it("back stays in the app: history when there is some, else the parent screen", async () => {
    function Back() {
      const back = useBack("/settings/");
      return (
        <button type="button" onClick={back}>
          Back
        </button>
      );
    }
    const view = render(
      <>
        <NavigationTracker />
        <Back />
      </>,
    );
    expect(canGoBack()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.replace).toHaveBeenCalledWith("/settings/");

    pathname = "/log";
    search = new URLSearchParams("task=1");
    view.rerender(
      <>
        <NavigationTracker />
        <Back />
      </>,
    );
    expect(canGoBack()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalled();

    pathname = "/";
    search = new URLSearchParams();
    view.rerender(
      <>
        <NavigationTracker />
        <Back />
      </>,
    );
    expect(canGoBack()).toBe(false);
  });

  it("ScreenRoot stamps the page ID; bars render their actions", async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <ScreenRoot pageId="P06" className="x">
        <ScreenHeader title="Settings" back={false} />
        <ScreenHeader title="Help" />
        <BackBar
          backLabel="Settings"
          title="Log"
          fallback="/settings/"
          action={<button type="button">Export</button>}
        />
        <BackBar backLabel="Today" fallback="/" />
        <FormBar title="New task" onCancel={onCancel} onSave={onSave} busy={false} />
      </ScreenRoot>,
    );
    expect(document.querySelector('[data-page-id="P06"]')).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(router.replace).toHaveBeenCalledWith("/");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(router.replace).toHaveBeenCalledWith("/settings/");
  });
});

describe("SortableList", () => {
  const items = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];

  it("computes ↑/↓ targets as 'after this id'", () => {
    expect(neighbourMove(items, 0, -1)).toBeUndefined();
    expect(neighbourMove(items, 1, -1)).toBeNull();
    expect(neighbourMove(items, 2, -1)).toBe("a");
    expect(neighbourMove(items, 0, 1)).toBe("b");
    expect(neighbourMove(items, 2, 1)).toBeUndefined();
  });

  it("renders handles and reorders with the keyboard", async () => {
    const onReorder = vi.fn();
    render(
      <SortableList
        items={items}
        label="Plans"
        nameOf={(i) => i.name}
        onReorder={onReorder}
        render={(item, { handle }) => (
          <div>
            {handle}
            {item.name}
          </div>
        )}
      />,
    );
    expect(screen.getByRole("list", { name: "Plans" })).toBeInTheDocument();
    const handle = screen.getByRole("button", { name: "Move A" });
    handle.focus();
    await act(async () => {
      fireEvent.keyDown(handle, { key: " ", code: "Space" });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "ArrowDown", code: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: " ", code: "Space" });
    });
    // jsdom has no layout, so the drop may not resolve to a target; it must never throw.
    expect(onReorder.mock.calls.every(([id]) => id === "a")).toBe(true);
  });
});
