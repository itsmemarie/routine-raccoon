"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P07 · Progress: shows the error code with page ID P07. */
export default function ProgressError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P07" />;
}
