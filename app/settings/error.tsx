"use client";

import { RouteError, type RouteErrorProps } from "@/components/errors/route-error";

/** Error boundary for P06 · Settings: shows the error code with page ID P06. */
export default function SettingsError(props: RouteErrorProps) {
  return <RouteError {...props} pageId="P06" />;
}
