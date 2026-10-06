import type { ErrorCode } from "@/lib/errors/codes";
import type { PageId } from "@/lib/errors/pages";

/**
 * In-memory ring buffer of recent errors (TECH_SPEC §5.4). Help → "Copy diagnostics" turns it
 * into text the user can paste into a bug report. Contains codes, page IDs and times only: no PII.
 */
export interface DiagnosticEntry {
  readonly at: string;
  readonly code: ErrorCode;
  readonly pageId: PageId | null;
  readonly errorId: string;
}

const CAPACITY = 50;
const entries: DiagnosticEntry[] = [];

export function recordDiagnostic(entry: DiagnosticEntry): void {
  entries.push(entry);
  if (entries.length > CAPACITY) entries.splice(0, entries.length - CAPACITY);
}

export function recentDiagnostics(): readonly DiagnosticEntry[] {
  return [...entries];
}

export function clearDiagnostics(): void {
  entries.length = 0;
}

/** Plain-text report, newest first, safe to paste anywhere. */
export function formatDiagnostics(meta: { version: string; env: string; now: Date }): string {
  const header = `Routine Raccoon ${meta.version} (${meta.env}) · ${meta.now.toISOString()}`;
  if (entries.length === 0) return `${header}\nNo errors recorded in this session.`;
  const lines = [...entries]
    .reverse()
    .map((e) => `${e.at}  ${e.code}  ${e.pageId ?? "P00"}  #${e.errorId}`);
  return [header, ...lines].join("\n");
}
