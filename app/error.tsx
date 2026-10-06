"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P01 · Today: shows the error code with page ID P01. */
export default function TodayError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P01" />;
}
