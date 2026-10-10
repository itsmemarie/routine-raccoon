// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type * as AuthModule from "@/data/remote/auth";
import type { AccountUser } from "@/data/remote/auth";
import { ok } from "@/lib/errors/result";
import { AuthScreen } from "./auth-screen";

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}));

const user: AccountUser = { id: "u1", email: "leo@example.com", name: "Leo", provider: "google" };
const exchangeOAuthCode = vi.fn();
vi.mock("@/data/remote/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  exchangeOAuthCode: (code: string) => exchangeOAuthCode(code),
}));
vi.mock("@/data/remote/session", () => ({
  useSession: () => ({ status: "signed-out" }),
}));

// Linking (the first sync) is slow on a phone: keep it pending until the test says so.
const linking = { busy: false, link: vi.fn(), sheet: null };
vi.mock("./use-link-account", () => ({ useLinkAccount: () => linking }));

describe("AuthScreen, back from Google", () => {
  beforeEach(() => {
    search = new URLSearchParams("code=abc");
    exchangeOAuthCode.mockResolvedValue(ok(user));
  });

  it("shows 'Signing you in…' with nothing to tap until the phone is linked", async () => {
    let linked: () => void = () => undefined;
    linking.link.mockImplementation(() => {
      linking.busy = true;
      return new Promise<void>((resolve) => {
        linked = () => {
          linking.busy = false;
          resolve();
        };
      });
    });
    render(<AuthScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(exchangeOAuthCode).toHaveBeenCalledWith("abc");
    expect(linking.link).toHaveBeenCalledWith(user, "signed-in");
    expect(screen.getByRole("status")).toHaveTextContent("Signing you in…");
    expect(screen.queryByRole("button", { name: /Continue with Google/ })).toBeNull();

    await act(async () => {
      linked();
      await Promise.resolve();
    });
    // Linking failed or asked to merge: the form is back (on success the screen navigates).
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeEnabled();
  });
});
