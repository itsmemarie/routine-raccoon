"use client";

import { useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { accountUserFrom, type AccountUser } from "./auth";

/**
 * The device's account state, from Supabase Auth's own events (INITIAL_SESSION, SIGNED_IN,
 * SIGNED_OUT, TOKEN_REFRESHED…). "unconfigured" when the build has no account (RR-AUTH-008).
 */
export type SessionState =
  | { readonly status: "unconfigured" }
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly user: AccountUser };

const LOADING: SessionState = { status: "loading" };

let state: SessionState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;
  const supabase = getSupabaseClient();
  if (!supabase.ok) {
    set({ status: "unconfigured" });
    return;
  }
  // The callback must not await other Supabase calls (supabase-js deadlock rule): it only
  // records the new state; listeners react afterwards.
  supabase.value.auth.onAuthStateChange((_event, session) => {
    set(
      session
        ? { status: "signed-in", user: accountUserFrom(session.user) }
        : { status: "signed-out" },
    );
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export function getSessionState(): SessionState {
  start();
  return state;
}

/** Live account state for screens (Settings, Account, Auth) and the sync controller. */
export function useSession(): SessionState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
}

/** Test seam. */
export function resetSessionStore(): void {
  state = LOADING;
  started = false;
  listeners.clear();
}
