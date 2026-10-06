"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P04 · Section: shows the error code with page ID P04. */
export default function SectionFormError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P04" />;
}
