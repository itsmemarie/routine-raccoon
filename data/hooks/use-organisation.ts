"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/data/db/client";
import type { Organisation } from "@/domain/organise";
import { normalizeSettings } from "@/domain/settings";
import type { Settings } from "@/domain/types";
import { toAppError } from "@/lib/errors/app-error";

export interface OrganisationSnapshot extends Organisation {
  readonly settings: Settings;
}

/**
 * Every definition (plans, links, sections, tasks) plus settings, live. Feeds the organising
 * screens through the pure selectors in domain/organise.ts.
 */
export function useOrganisation(): OrganisationSnapshot | undefined {
  return useLiveQuery(async () => {
    try {
      const db = getDb();
      const [plans, planSections, sections, tasks, settingsRow] = await Promise.all([
        db.day_plans.toArray(),
        db.plan_sections.toArray(),
        db.sections.toArray(),
        db.tasks.toArray(),
        db.user_settings.get("me"),
      ]);
      return {
        plans,
        planSections,
        sections,
        tasks,
        settings: normalizeSettings(settingsRow?.settings),
      };
    } catch (error) {
      throw toAppError(error, "RR-DB-001");
    }
  }, []);
}
