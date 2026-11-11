"use client";

import {
  Archive,
  Copy,
  FolderInput,
  Layers,
  Link2,
  Pencil,
  Split,
  Trash2,
  Unlink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm";
import type { MenuItem } from "@/components/ui/menu";
import { defaultContext } from "@/data/commands/context";
import {
  archiveSection,
  deleteSection,
  duplicateSection,
  removeSectionFromPlan,
} from "@/data/commands/sections";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { plansOfSection } from "@/domain/organise";
import type { DayPlan, Section } from "@/domain/types";
import type { PageId } from "@/lib/errors/pages";
import { CopyMoveSheet, type CopyMoveTarget } from "./copy-move-sheet";
import { useCoupling } from "./coupling-sheet";
import { useRun } from "./use-run";

const ICON = { size: 15, strokeWidth: 1.6 } as const;

export type SectionAction =
  "edit" | "duplicate" | "copy" | "move" | "couple" | "separate" | "remove" | "archive" | "delete";

/**
 * Section actions shared by Today's ⋯ menu (handoff screen 5) and the Sections manager
 * (screen 14). `plan` is the Day Plan the section is being shown in.
 */
export function useSectionActions(pageId: PageId) {
  const router = useRouter();
  const run = useRun(pageId);
  const [sheet, setSheet] = useState<CopyMoveTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Section | null>(null);
  const ctx = () => defaultContext();
  const coupling = useCoupling(pageId);
  const org = useOrganisation();

  const perform = (action: SectionAction, section: Section, plan: DayPlan) => {
    switch (action) {
      case "edit":
        router.push(
          `/section/edit/?id=${encodeURIComponent(section.id)}&plan=${encodeURIComponent(plan.id)}`,
        );
        return;
      case "duplicate":
        void run(duplicateSection(ctx(), { sectionId: section.id, planId: plan.id }), {
          success: `${section.name} duplicated`,
        });
        return;
      case "copy":
        setSheet({
          kind: "section-copy",
          sectionId: section.id,
          name: section.name,
          fromPlanId: plan.id,
        });
        return;
      case "move":
        setSheet({
          kind: "section-move",
          sectionId: section.id,
          name: section.name,
          fromPlanId: plan.id,
        });
        return;
      case "couple":
        coupling.open({ kind: "section", sectionId: section.id, planId: plan.id });
        return;
      case "separate":
        // "Decouple from other Day Plans" opens the Coupling sheet with every coupled plan turned
        // off, so the consequence (history moves, no Undo) is read before it happens.
        coupling.open(
          { kind: "section", sectionId: section.id, planId: plan.id },
          org
            ? plansOfSection(org, section.id)
                .filter((p) => p.id !== plan.id)
                .map((p) => p.id)
            : [],
        );
        return;
      case "remove":
        void run(removeSectionFromPlan(ctx(), { sectionId: section.id, planId: plan.id }), {
          success: `${section.name} removed from ${plan.name}`,
        });
        return;
      case "archive":
        void run(archiveSection(ctx(), { sectionId: section.id }), {
          success: `${section.name} archived`,
        });
        return;
      case "delete":
        setConfirmDelete(section);
        return;
    }
  };

  /** Menu items for a section; Decouple and Remove only when it's coupled into other plans. */
  const menuItems = (section: Section, plan: DayPlan, inOtherPlans: boolean): MenuItem[] => [
    {
      label: "Edit section",
      icon: <Pencil {...ICON} />,
      onSelect: () => perform("edit", section, plan),
    },
    {
      label: "Duplicate",
      icon: <Layers {...ICON} />,
      onSelect: () => perform("duplicate", section, plan),
    },
    {
      label: "Copy to Day Plan",
      icon: <Copy {...ICON} />,
      onSelect: () => perform("copy", section, plan),
    },
    {
      label: "Move to Day Plan",
      icon: <FolderInput {...ICON} />,
      onSelect: () => perform("move", section, plan),
    },
    {
      label: "Couple with Day Plans…",
      icon: <Link2 {...ICON} />,
      onSelect: () => perform("couple", section, plan),
    },
    ...(inOtherPlans
      ? [
          {
            label: "Decouple from other Day Plans",
            icon: <Split {...ICON} />,
            onSelect: () => perform("separate", section, plan),
          },
          {
            label: "Remove from this Day Plan",
            icon: <Unlink {...ICON} />,
            onSelect: () => perform("remove", section, plan),
          },
        ]
      : []),
    {
      label: "Archive",
      icon: <Archive {...ICON} />,
      onSelect: () => perform("archive", section, plan),
    },
    {
      label: "Delete",
      icon: <Trash2 {...ICON} />,
      destructive: true,
      onSelect: () => perform("delete", section, plan),
    },
  ];

  const dialogs: ReactNode = (
    <>
      {coupling.sheet}
      {sheet ? (
        <CopyMoveSheet target={sheet} pageId={pageId} onClose={() => setSheet(null)} />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${confirmDelete.name}”?`}
          body="The section and its tasks are removed for good. Archiving keeps the history instead."
          confirmLabel="Delete section"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const section = confirmDelete;
            setConfirmDelete(null);
            void run(deleteSection(ctx(), { sectionId: section.id }), {
              success: `Deleted ${section.name}`,
            });
          }}
        />
      ) : null}
    </>
  );

  return { perform, menuItems, dialogs };
}
