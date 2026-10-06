"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P09 · Archive: shows the error code with page ID P09. */
export default function ArchiveError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P09" />;
}
