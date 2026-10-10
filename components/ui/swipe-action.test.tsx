// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SWIPE_COMMIT_PX, SWIPE_SLIDE_MS, SwipeAction } from "./swipe-action";

/** jsdom has no layout, so rows are 0 px wide and the threshold is SWIPE_COMMIT_PX. */
function swipe(target: Element, dx: number, dy = 0, pointerType = "touch") {
  const at = (f: number) => ({
    pointerId: 1,
    pointerType,
    isPrimary: true,
    clientX: 300 + dx * f,
    clientY: 20 + dy * f,
  });
  fireEvent.pointerDown(target, at(0));
  for (const f of [0.25, 0.5, 0.75, 1]) fireEvent.pointerMove(target, at(f));
  fireEvent.pointerUp(target, at(1));
}

function setup(onCommit = vi.fn(() => Promise.resolve(true)), disabled = false) {
  const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
  render(
    <SwipeAction label="Skip today" icon={null} onCommit={onCommit} disabled={disabled}>
      <button type="button" data-swipe-ignore="">
        Grip
      </button>
      <a href="/task/" onClick={onClick}>
        Row
      </a>
    </SwipeAction>,
  );
  const row = screen.getByText("Row");
  const transform = () => row.parentElement?.style.transform ?? "";
  return { onCommit, onClick, row, transform };
}

async function finishSlide() {
  await act(async () => {
    vi.advanceTimersByTime(SWIPE_SLIDE_MS);
    await Promise.resolve();
  });
}

describe("SwipeAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a long swipe left reveals the action, slides out and commits once", async () => {
    const { onCommit, onClick, row, transform } = setup();
    swipe(row, -(SWIPE_COMMIT_PX + 60));
    expect(screen.getByTestId("swipe-action")).toHaveTextContent("Skip today");
    expect(screen.getByTestId("swipe-action")).toHaveAttribute("data-armed", "true");
    expect(onCommit).not.toHaveBeenCalled();
    await finishSlide();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(transform()).toMatch(/translateX\(-\d+px\)/);
    // The tap that ends a swipe never opens the row.
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a short swipe springs back without acting, and taps still work afterwards", async () => {
    const { onCommit, onClick, row, transform } = setup();
    swipe(row, -40);
    expect(screen.getByTestId("swipe-action")).toHaveAttribute("data-armed", "false");
    expect(transform()).toBe("translateX(0px)");
    await finishSlide();
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swipe-action")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("comes back when the action fails", async () => {
    const { row, transform } = setup(vi.fn(() => Promise.resolve(false)));
    swipe(row, -(SWIPE_COMMIT_PX + 60));
    await finishSlide();
    expect(transform()).toBe("translateX(0px)");
    await finishSlide();
    expect(screen.queryByTestId("swipe-action")).toBeNull();
  });

  it("ignores scrolls, rightward swipes, the mouse, grips and disabled rows", async () => {
    const far = -(SWIPE_COMMIT_PX + 60);
    const first = setup();
    swipe(first.row, -30, 200); // mostly vertical: a scroll
    swipe(first.row, 200); // rightwards
    swipe(first.row, far, 0, "mouse");
    swipe(screen.getByText("Grip"), far);
    await finishSlide();
    expect(first.onCommit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swipe-action")).toBeNull();

    const onCommit = vi.fn(() => Promise.resolve(true));
    render(
      <SwipeAction label="Skip" icon={null} onCommit={onCommit} disabled>
        <span>Off</span>
      </SwipeAction>,
    );
    swipe(screen.getByText("Off"), far);
    await finishSlide();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a cancelled pointer (the browser took over to scroll) springs back", () => {
    const { onCommit, row, transform } = setup();
    const base = { pointerId: 1, pointerType: "touch", isPrimary: true, clientY: 20 };
    fireEvent.pointerDown(row, { ...base, clientX: 300 });
    fireEvent.pointerMove(row, { ...base, clientX: 200 });
    expect(transform()).toBe("translateX(-90px)");
    fireEvent.pointerCancel(row, { ...base, clientX: 200 });
    expect(transform()).toBe("translateX(0px)");
    expect(onCommit).not.toHaveBeenCalled();
  });
});
