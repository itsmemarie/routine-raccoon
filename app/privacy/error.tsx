"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P12 · Privacy: shows the error code with page ID P12. */
export default function PrivacyError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P12" />;
}
