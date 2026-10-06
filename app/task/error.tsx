"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P02 · Task: shows the error code with page ID P02. */
export default function TaskDetailError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P02" />;
}
