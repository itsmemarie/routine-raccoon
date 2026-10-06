import { create } from "zustand";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";

/**
 * One toast at a time, bottom of the screen (handoff: dark toast, 2s; undo snackbar, 5s).
 * Error toasts always carry their code + page (TECH_SPEC §1.5 rule 2).
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

interface ToastState {
  current: Toast | null;
  show: (toast: Omit<Toast, "id" | "durationMs"> & { durationMs?: number }) => number;
  dismiss: (id: number, reason: "timeout" | "action" | "replaced") => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  show(toast) {
    const previous = get().current;
    if (previous) get().dismiss(previous.id, "replaced");
    const id = nextId++;
    set({ current: { durationMs: 2000, ...toast, id } });
    return id;
  },
  dismiss(id, reason) {
    const current = get().current;
    if (!current || current.id !== id) return;
    set({ current: null });
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
