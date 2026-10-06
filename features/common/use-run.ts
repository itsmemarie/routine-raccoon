"use client";

import { useCallback } from "react";
import { toastError, useToastStore } from "@/components/ui/toast-store";
import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { reportError } from "@/lib/errors/report";
import type { Result } from "@/lib/errors/result";

export interface RunOptions<T> {
  /** Toast on success; a function can derive it from the result (null = no toast). */
  readonly success?: string | ((value: T) => string | null);
  /**
   * Called instead of a toast for input errors (RR-VAL, RR-IMP), so forms can show them
   * inline next to the field with their code.
   */
  readonly onInputError?: (error: AppError) => void;
}

/**
 * Runs a command and surfaces the outcome (TECH_SPEC §1.5 rules 2 and 5): failures are always
 * shown with their code and page ID; unexpected ones are also reported to diagnostics and
 * telemetry. User-input mistakes (info severity) are shown but not reported as faults.
 */
export function useRun(pageId: PageId) {
  return useCallback(
    async <T>(
      promise: Promise<Result<T, AppError>>,
      options: RunOptions<T> = {},
    ): Promise<Result<T, AppError>> => {
      const result = await promise;
      if (result.ok) {
        const message =
          typeof options.success === "function" ? options.success(result.value) : options.success;
        if (message) useToastStore.getState().show({ message });
        return result;
      }
      const error = result.error;
      const isInputError = error.code.startsWith("RR-VAL-") || error.code.startsWith("RR-IMP-");
      if (isInputError && options.onInputError) {
        options.onInputError(error);
      } else if (error.severity === "info") {
        toastError(error, pageId);
      } else {
        const { errorId } = reportError(error, { pageId });
        toastError(error, pageId, errorId);
      }
      return result;
    },
    [pageId],
  );
}

/** Shows a plain toast (no error). */
export function showToast(message: string): void {
  useToastStore.getState().show({ message });
}
