"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P08 · Log: shows the error code with page ID P08. */
export default function LogError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P08" />;
}
