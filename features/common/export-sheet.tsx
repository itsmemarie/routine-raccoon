"use client";

import { FileJson, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toastError } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import { prepareExport, type ExportKind } from "@/data/commands/export";
import { getEnv } from "@/lib/env";
import type { PageId } from "@/lib/errors/pages";
import { reportError } from "@/lib/errors/report";
import { saveTextFile } from "@/lib/platform/files";
import { showToast } from "./use-run";

const CHOICES: readonly { kind: ExportKind; title: string; detail: string; csv: boolean }[] = [
  {
    kind: "json",
    title: "Everything",
    detail: "Day Plans, sections, tasks, ticks and the log · JSON",
    csv: false,
  },
  { kind: "tasks", title: "Tasks", detail: "One row per task, for a spreadsheet · CSV", csv: true },
  { kind: "log", title: "Log", detail: "Every entry, oldest first · CSV", csv: true },
];

/** "Export all data" (PRD R14/R20): plain files the user keeps. Failures show RR-EXP-001. */
export function ExportSheet({
  pageId,
  includesArchive,
  onClose,
}: {
  pageId: PageId;
  includesArchive: boolean;
  onClose: () => void;
}) {
  const fail = (error: Parameters<typeof reportError>[0]) => {
    const reported = reportError(error, { pageId, fallback: "RR-EXP-001" });
    toastError(reported.error, pageId, reported.errorId);
  };

  const exportAs = async (kind: ExportKind) => {
    const prepared = await prepareExport(defaultContext(), { kind, appVersion: getEnv().version });
    if (!prepared.ok) return fail(prepared.error);
    const saved = await saveTextFile(prepared.value);
    if (!saved.ok) return fail(saved.error);
    if (saved.value !== "cancelled") showToast(`Exported ${prepared.value.fileName}`);
    onClose();
  };

  return (
    <Sheet
      title="Export all data"
      description={`Plain files you keep. Archived Day Plans and sections are ${includesArchive ? "included" : "left out"} (change it under Archive). Exports aren't encrypted.`}
      onClose={onClose}
      testId="export-sheet"
      footer={
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <ul className="flex flex-col gap-2">
        {CHOICES.map((choice) => (
          <li key={choice.kind}>
            <button
              type="button"
              onClick={() => void exportAs(choice.kind)}
              className="flex min-h-14 w-full items-center gap-3 rounded-card border border-border bg-surface px-[15px] py-3 text-left"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink">
                {choice.csv ? (
                  <FileSpreadsheet size={17} strokeWidth={1.7} aria-hidden />
                ) : (
                  <FileJson size={17} strokeWidth={1.7} aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{choice.title}</span>
                <span className="mt-0.5 block text-[11.5px] font-medium text-text-muted">
                  {choice.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
