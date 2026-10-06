"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P03 · New task: shows the error code with page ID P03. */
export default function TaskFormError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P03" />;
}
