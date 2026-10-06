"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P10 · Day complete: shows the error code with page ID P10. */
export default function DayCompleteError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P10" />;
}
