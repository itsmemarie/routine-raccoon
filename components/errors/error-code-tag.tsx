import type { ErrorCode } from "@/lib/errors/codes";
import type { PageId } from "@/lib/errors/pages";

/**
 * The visible error reference: "RR-DB-002 · P01" (TECH_SPEC §1.5 rule 2). Rendered with every
 * error message (screens, panels, toasts, field errors) so the user can always quote it.
 */
export function ErrorCodeTag({
  code,
  pageId,
  errorId,
  tone = "muted",
}: {
  code: ErrorCode;
  pageId: PageId | null;
  errorId?: string;
  tone?: "muted" | "inverse";
}) {
  return (
    <span
      data-error-code={code}
      data-page-id={pageId ?? "P00"}
      className={`font-mono text-[11px] tracking-wide ${tone === "inverse" ? "text-text-on-dark" : "text-text-faint"}`}
    >
      {code} · {pageId ?? "P00"}
      {errorId ? ` · #${errorId}` : null}
    </span>
  );
}
