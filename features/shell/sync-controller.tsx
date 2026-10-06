"use client";

import { useEffect, useRef } from "react";
import { toastError } from "@/components/ui/toast-store";
import { onLocalWrite } from "@/data/events";
import { useKv } from "@/data/hooks/use-kv";
import { useSession } from "@/data/remote/session";
import { syncNow } from "@/data/sync/runtime";
import { onAppResume } from "@/lib/platform/lifecycle";

const DEBOUNCE_MS = 2_000;
const INTERVAL_MS = 5 * 60_000;

/**
 * Sync triggers (TECH_SPEC §2.6): on start, 2 s after a local write, when back online, on
 * resume, and every 5 minutes in the foreground. Only while this phone is linked to the
 * signed-in account. Background failures are recorded for the Account screen; only "sign in
 * again" (RR-AUTH-004) interrupts with a toast, once.
 */
export function SyncController() {
  const session = useSession();
  const owner = useKv("sync_owner");
  const linked = session.status === "signed-in" && owner === session.user.id;
  const warned = useRef(false);

  useEffect(() => {
    if (!linked) return undefined;
    let debounce: number | undefined;
    let alive = true;
    const run = () => {
      void syncNow().then((result) => {
        if (!alive || result.ok) return;
        if (result.error.code === "RR-AUTH-004" && !warned.current) {
          warned.current = true;
          toastError(result.error, "P00");
        }
      });
    };
    run();
    const offWrite = onLocalWrite(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(run, DEBOUNCE_MS);
    });
    const offResume = onAppResume(run);
    window.addEventListener("online", run);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, INTERVAL_MS);
    return () => {
      alive = false;
      window.clearTimeout(debounce);
      window.clearInterval(interval);
      window.removeEventListener("online", run);
      offWrite();
      offResume();
    };
  }, [linked]);

  return null;
}
