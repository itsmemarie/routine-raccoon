// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Toaster } from "@/components/ui/toaster";
import { toastError, useToastStore } from "@/components/ui/toast-store";
import { AppError } from "@/lib/errors/app-error";
import { clearDiagnostics, recentDiagnostics } from "@/lib/telemetry/diagnostics";
import { ErrorCodeTag } from "./error-code-tag";
import { ErrorPanel } from "./error-panel";
import { RouteError } from "./route-error";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("error UI always shows the code and page ID", () => {
  beforeEach(() => {
    clearDiagnostics();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("ErrorCodeTag renders 'CODE · PAGE · #id'", () => {
    render(<ErrorCodeTag code="RR-DB-002" pageId="P01" errorId="abcd1234" />);
    expect(screen.getByText("RR-DB-002 · P01 · #abcd1234")).toBeInTheDocument();
    render(<ErrorCodeTag code="RR-APP-001" pageId={null} tone="inverse" />);
    expect(screen.getByText("RR-APP-001 · P00")).toBeInTheDocument();
  });

  it("RouteError maps the thrown value, reports once with the page ID, and offers retry", () => {
    const retry = vi.fn();
    render(<RouteError error={new TypeError("Failed to fetch")} retry={retry} pageId="P02" />);
    expect(screen.getByRole("alert")).toHaveTextContent("You're offline");
    expect(screen.getByText(/RR-NET-001 · P02 · #[0-9a-f]{8}/)).toBeInTheDocument();
    expect(recentDiagnostics()).toMatchObject([{ code: "RR-NET-001", pageId: "P02" }]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/");
  });

  it("RouteError on Today hides 'Go to Today'; non-retryable codes hide 'Try again'", () => {
    render(<RouteError error={new AppError("RR-APP-004")} retry={vi.fn()} pageId="P01" />);
    expect(screen.queryByRole("link", { name: "Go to Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("ErrorPanel copies details to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ErrorPanel
        error={new AppError("RR-DB-003")}
        pageId="P03"
        errorId="feedc0de"
        layout="inline"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    });
    expect(writeText.mock.calls[0]?.[0]).toMatch(/Code: RR-DB-003\nPage: P03\nError id: feedc0de/);
    expect(screen.getByRole("button", { name: "Details copied" })).toBeInTheDocument();
  });

  it("ErrorPanel keeps the code visible when the clipboard is blocked", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ErrorPanel error={new AppError("RR-DB-003")} pageId="P03" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    });
    expect(screen.getByRole("button", { name: "Copy details" })).toBeInTheDocument();
    expect(screen.getByText(/RR-DB-003 · P03/)).toBeInTheDocument();
  });
});

describe("toasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => useToastStore.setState({ current: null }));
  });
  afterEach(() => vi.useRealTimers());

  it("error toasts carry their code and page", () => {
    render(<Toaster />);
    act(() => toastError(new AppError("RR-DB-002"), "P01", "1234abcd"));
    expect(screen.getByRole("alert")).toHaveTextContent("That change wasn't saved");
    expect(screen.getByText("RR-DB-002 · P01 · #1234abcd")).toBeInTheDocument();
  });

  it("undo snackbar: action runs without expiring; timeout expires; replacement expires the old one", () => {
    render(<Toaster />);
    const onPress = vi.fn();
    const onExpire = vi.fn();
    act(() => {
      useToastStore.getState().show({
        message: "Ticked Shower",
        durationMs: 5000,
        action: { label: "Undo", onPress },
        onExpire,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    act(() => {
      useToastStore.getState().show({ message: "Ticked Teeth", durationMs: 5000, onExpire });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("toast")).toBeNull();

    act(() => {
      useToastStore.getState().show({ message: "A", onExpire });
      useToastStore.getState().show({ message: "B" });
    });
    expect(onExpire).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("toast")).toHaveTextContent("B");
    act(() => useToastStore.getState().dismiss(-1, "timeout"));
    expect(screen.getByTestId("toast")).toHaveTextContent("B");
  });
});
