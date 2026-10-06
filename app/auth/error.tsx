"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P13 · Sign in: shows the error code with page ID P13. */
export default function AuthError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P13" />;
}
