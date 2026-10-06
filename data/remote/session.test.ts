// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { AppError } from "@/lib/errors/app-error";
import { err, ok } from "@/lib/errors/result";
import { getSessionState, resetSessionStore, useSession } from "./session";

type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;
let listener: Listener | null = null;
let configured = true;

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () =>
    configured
      ? ok({
          auth: {
            onAuthStateChange: (cb: Listener) => {
              listener = cb;
              return { data: { subscription: { unsubscribe: () => undefined } } };
            },
          },
        })
      : err(new AppError("RR-AUTH-008")),
}));

beforeEach(() => {
  resetSessionStore();
  listener = null;
  configured = true;
});

describe("session store", () => {
  it("follows Supabase's auth events", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.status).toBe("loading");
    act(() =>
      listener?.("INITIAL_SESSION", {
        user: { id: "u1", email: "leo@example.com", app_metadata: {}, user_metadata: {} } as never,
      }),
    );
    expect(result.current).toMatchObject({ status: "signed-in", user: { id: "u1" } });
    act(() => listener?.("SIGNED_OUT", null));
    expect(result.current.status).toBe("signed-out");
    expect(getSessionState().status).toBe("signed-out");
  });

  it("is 'unconfigured' when the build has no account", () => {
    configured = false;
    expect(getSessionState().status).toBe("unconfigured");
  });
});
