import type { AppError } from "@/lib/errors/app-error";
import type { PageId } from "@/lib/errors/pages";
import { ErrorCodeTag } from "./error-code-tag";

/**
 * Inline message for a failed form action (validation and the like). Shows the user message
 * with its code and page ID, like every other error surface (TECH_SPEC §1.5 rule 2).
 */
export function InlineError({
  error,
  pageId,
  className = "",
}: {
  error: AppError;
  pageId: PageId;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="inline-error"
      className={`flex flex-col gap-1 rounded-xl bg-tint px-[13px] py-[11px] ${className}`}
    >
      <span className="text-[12.5px] leading-[1.45] font-semibold text-primary-dark">
        {error.userMessage}
      </span>
      <ErrorCodeTag code={error.code} pageId={pageId} />
    </div>
  );
}
