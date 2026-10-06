"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P15 · Setup: shows the error code with page ID P15. */
export default function SetupError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P15" />;
}
