"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P05 · Sections: shows the error code with page ID P05. */
export default function SectionsManagerError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P05" />;
}
