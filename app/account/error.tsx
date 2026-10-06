"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P14 · Account: shows the error code with page ID P14. */
export default function AccountError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P14" />;
}
