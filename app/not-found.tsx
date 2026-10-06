"use client";

import { ErrorPanel } from "@/components/errors/error-panel";
import { AppError } from "@/lib/errors/app-error";

/** Unknown routes (static export writes this as 404.html): RR-APP-003 on the shell page. */
export default function NotFound() {
  return <ErrorPanel error={new AppError("RR-APP-003")} pageId="P00" showHome />;
}
