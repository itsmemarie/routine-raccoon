import { create } from "zustand";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";

/**
 * One toast at a time, bottom of the screen (handoff: dark toast, 2s; undo snackbar, 5s).
 * Error toasts always carry their code + page (TECH_SPEC §1.5 rule 2). A toast with an action
 * (Undo) is never covered by one without: that one waits its turn, so a background message
 * (a sync error, "Saved") can't take Undo away before its window closes.
 */
export interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly durationMs: number;
  readonly action?: ToastAction;
  readonly error?: {
    readonly code: AppError["code"];
    readonly pageId: PageId | null;
    readonly errorId?: string;
  };
  /** Called when the toast leaves WITHOUT its action being pressed (e.g. the undo window closed). */
  readonly onExpire?: () => void;
}

type ToastInput = Omit<Toast, "id" | "durationMs"> & { durationMs?: number };

/** Toasts waiting for an action toast to close; oldest first, capped so they can't pile up. */
const MAX_QUEUED = 3;

interface ToastState {
  current: Toast | null;
  queue: readonly Toast[];
  show: (toast: ToastInput) => number;
  dismiss: (id: number, reason: "timeout" | "action" | "replaced") => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  queue: [],
  show(toast) {
    const id = nextId++;
    const next: Toast = { durationMs: 2000, ...toast, id };
    const previous = get().current;
    if (previous?.action && !next.action) {
      set({ queue: [...get().queue, next].slice(-MAX_QUEUED) });
      return id;
    }
    if (previous) get().dismiss(previous.id, "replaced");
    set({ current: next });
    return id;
  },
  dismiss(id, reason) {
    const current = get().current;
    if (!current || current.id !== id) return;
    const [waiting, ...rest] = reason === "replaced" ? [] : get().queue;
    set(waiting ? { current: waiting, queue: rest } : { current: null });
    if (reason !== "action") current.onExpire?.();
  },
}));

/** Shows an AppError as a toast: user message + "RR-XXX-000 · Pxx". */
export function toastError(error: AppError, pageId: PageId | null, errorId?: string): void {
  useToastStore.getState().show({
    message: error.userMessage,
    durationMs: 5000,
    error: { code: error.code, pageId, ...(errorId ? { errorId } : {}) },
  });
}
