"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P11 · Help: shows the error code with page ID P11. */
export default function HelpError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P11" />;
}
