"use client";

import { useEffect } from "react";
import { ErrorCodeTag } from "@/components/errors/error-code-tag";
import { useToastStore } from "./toast-store";

/** Renders the current toast and owns its timer. Mounted once by the app shell. */
export function Toaster() {
  const toast = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => dismiss(toast.id, "timeout"), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+var(--timer-bar-space,0px))] z-50 flex justify-center px-[18px]">
      <div
        role={toast.error ? "alert" : "status"}
        data-testid="toast"
        className="pointer-events-auto flex w-full max-w-[376px] animate-up items-center gap-3 rounded-chip bg-ink px-4 py-3 text-white shadow-toast"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold">{toast.message}</span>
          {toast.error ? (
            <ErrorCodeTag
              code={toast.error.code}
              pageId={toast.error.pageId}
              tone="inverse"
              {...(toast.error.errorId ? { errorId: toast.error.errorId } : {})}
            />
          ) : null}
        </div>
        {toast.action ? (
          <button
            type="button"
            className="min-h-11 shrink-0 px-2 text-[13px] font-bold text-amber"
            onClick={() => {
              dismiss(toast.id, "action");
              toast.action?.onPress();
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
