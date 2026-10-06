"use client";

import { useSearchParams } from "next/navigation";
import { getEnv } from "@/lib/env";
import { AppError } from "./app-error";
import { isErrorCode } from "./codes";
import type { PageId } from "./pages";

/** Query param that forces an error screen in test builds: `?__fault=RR-DB-001` or `?__fault=render`. */
export const FAULT_PARAM = "__fault";

/**
 * Throws during render when fault injection is enabled and requested, so E2E can prove that
 * every route's error boundary shows a code (TECH_SPEC §1.5 rule 10). A no-op in production:
 * the build refuses NEXT_PUBLIC_ENABLE_FAULTS there.
 */
export function useFaultInjection(pageId: PageId): void {
  const params = useSearchParams();
  const requested = params.get(FAULT_PARAM);
  if (!requested || !getEnv().enableFaults) return;
  const code = isErrorCode(requested) ? requested : "RR-APP-001";
  throw new AppError(code, { context: { injected: true, pageId } });
}
