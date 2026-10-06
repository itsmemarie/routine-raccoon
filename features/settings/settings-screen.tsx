"use client";

import { useState } from "react";
import { InlineError } from "@/components/errors/inline-error";
import { ChoiceChip } from "@/components/ui/chip";
import { PromptDialog } from "@/components/ui/confirm";
import { GroupHeading } from "@/components/ui/layout";
import { ScreenRoot } from "@/components/ui/screen";
import { SettingsGroup, SettingsRow } from "@/components/ui/settings-row";
import { Sheet } from "@/components/ui/sheet";
import { SwitchRow } from "@/components/ui/toggle";
import { defaultContext } from "@/data/commands/context";
import { setSurvivalMode } from "@/data/commands/day";
import { updateSettings } from "@/data/commands/settings";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useLogCount } from "@/data/hooks/use-log";
import { useOrganisation } from "@/data/hooks/use-organisation";
import { useTodaySnapshot } from "@/data/hooks/use-today-snapshot";
import { archivedPlans, archivedSections } from "@/domain/organise";
import { LONG_AT_OPTIONS } from "@/domain/settings";
import { survivalPlanFor, SURVIVAL_LEVELS } from "@/domain/survival";
import { formatHHMM12 } from "@/domain/time";
import type { Settings } from "@/domain/types";
import { getEnv } from "@/lib/env";
import type { AppError } from "@/lib/errors/app-error";
import { AccountCard } from "@/features/account";
import { ExportSheet, useRun } from "@/features/common";
import { TabBar } from "@/features/shell";
import { DayPlansList } from "./day-plans-list";
import { ResetTimeSheet } from "./reset-time-sheet";

const PAGE = "P06" as const;

type Overlay = "reset" | "rename-survival" | "default-level" | "export" | null;

/** Settings (P06, handoff screens 15–16). Group headings use the title scale (option 1A). */
export function SettingsScreen() {
  const org = useOrganisation();
  const dayKey = useEffectiveDayKey();
  const today = useTodaySnapshot(dayKey);
  const logCount = useLogCount();
  const run = useRun(PAGE);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [renameError, setRenameError] = useState<AppError | null>(null);

  if (!org || !dayKey || !today) return <ScreenRoot pageId={PAGE} className="pb-28" />;
  const settings = org.settings;
  const set = (patch: Partial<Settings>, success?: string) =>
    void run(updateSettings(defaultContext(), patch), success ? { success } : {});
  const survivalOn = today.dayRecord?.survival_on ?? false;
  const defaultPlan = survivalPlanFor(org.plans, settings.defaultLevel);
  const archive = { plans: archivedPlans(org).length, sections: archivedSections(org).length };

  return (
    <ScreenRoot pageId={PAGE} className="px-3.5 pt-3.5 pb-28">
      <h1 className="font-display text-[26px] leading-none font-bold tracking-[-0.03em] text-ink">
        Settings
      </h1>

      <GroupHeading className="mt-[22px]">Account</GroupHeading>
      <AccountCard pageId={PAGE} />

      <GroupHeading className="mt-[22px]">Day Plans</GroupHeading>
      <p className="mt-[7px] text-[12.5px] leading-[1.55] text-text-muted">
        A Day Plan is one version of your day. The primary one is the full thing; the{" "}
        {settings.survivalName} plans are shorter versions for when the full day isn&apos;t going to
        happen. Drag to reorder.
      </p>
      <DayPlansList org={org} />

      <GroupHeading className="mt-[22px]">{settings.survivalName}</GroupHeading>
      <SettingsGroup>
        <SwitchRow
          id="survival-today"
          title={`${settings.survivalName} Day`}
          description={`Turns it on for today at ${defaultPlan?.name ?? "the default level"}. Also on Today.`}
          checked={survivalOn}
          onChange={(on) => void run(setSurvivalMode(defaultContext(), { dayKey, on }))}
        />
        <SettingsRow
          title="What to call it"
          description="Used everywhere in the app"
          value={settings.survivalName}
          valueTone="accent"
          onClick={() => {
            setRenameError(null);
            setOverlay("rename-survival");
          }}
        />
        <SettingsRow
          title={`Default ${settings.survivalName} plan`}
          description="Used when you switch it on here"
          value={defaultPlan?.name ?? `Level ${settings.defaultLevel}`}
          valueTone="accent"
          onClick={() => setOverlay("default-level")}
        />
        <SwitchRow
          id="show-level"
          title="Ask which kind of day it is"
          description="A box on Today until you pick a plan for the day"
          checked={settings.showLevel}
          onChange={(showLevel) => set({ showLevel })}
        />
        <SwitchRow
          id="keep-overnight"
          title={`Keep ${settings.survivalName} on after the day resets`}
          description="Off: every day starts with the full plan"
          checked={settings.keepSurvivalOvernight}
          onChange={(keepSurvivalOvernight) => set({ keepSurvivalOvernight })}
        />
        <SwitchRow
          id="counts-full"
          title={`A ${settings.survivalName} Day counts as a full day`}
          description="In Progress. Off: it counts as showing up"
          checked={settings.survivalCountsAsFullDay}
          onChange={(survivalCountsAsFullDay) => set({ survivalCountsAsFullDay })}
        />
      </SettingsGroup>

      <GroupHeading className="mt-[22px]">Extra Support for tasks</GroupHeading>
      <SettingsGroup>
        <div className="px-[15px] py-3.5">
          <p id="long-at-label" className="text-[14px] font-semibold text-ink">
            A task gets Extra Support at
          </p>
          <p className="mt-0.5 text-[11.5px] font-medium text-text-muted">Hard tasks always do.</p>
          <div
            role="group"
            aria-labelledby="long-at-label"
            className="mt-[11px] flex flex-wrap gap-[7px]"
          >
            {LONG_AT_OPTIONS.map((minutes) => (
              <ChoiceChip
                key={minutes}
                selected={settings.longAt === minutes}
                onClick={() => set({ longAt: minutes })}
              >
                {minutes} min
              </ChoiceChip>
            ))}
          </div>
        </div>
        <SwitchRow
          id="first-step"
          title="Only the first step"
          description="Extra Support shows one step per task, not three"
          checked={settings.firstStep}
          onChange={(firstStep) => set({ firstStep })}
        />
      </SettingsGroup>

      <GroupHeading className="mt-[22px]">The day</GroupHeading>
      <SettingsGroup>
        <SettingsRow
          title="Day resets at"
          value={formatHHMM12(settings.resetAt)}
          valueTone="accent"
          onClick={() => setOverlay("reset")}
        />
        <SwitchRow
          id="roll"
          title="Roll unfinished tasks over"
          description="Off by default. Yesterday is finished."
          checked={settings.roll}
          onChange={(roll) => set({ roll })}
        />
      </SettingsGroup>

      <GroupHeading className="mt-[22px]">Data</GroupHeading>
      <SettingsGroup>
        <SettingsRow
          title="Log"
          description="Everything added, edited and ticked"
          value={logCount === undefined ? "" : logCount.toLocaleString("en-GB")}
          href="/log/"
        />
        <SettingsRow
          title="Export all data"
          description="Day Plans, tasks and the full log as JSON or CSV"
          value="Export"
          valueTone="accent"
          onClick={() => setOverlay("export")}
        />
        <SettingsRow
          title="Archive"
          value={`${archive.plans} Day ${archive.plans === 1 ? "Plan" : "Plans"} · ${archive.sections} ${archive.sections === 1 ? "section" : "sections"}`}
          href="/archive/"
        />
      </SettingsGroup>

      <GroupHeading className="mt-[22px]">About</GroupHeading>
      <SettingsGroup>
        <SettingsRow
          title="Help"
          description="Day Plans, sections, Survival Mode and error codes"
          href="/help/"
        />
        <SettingsRow
          title="Setup questions"
          description="Turn something you avoid into a small first step"
          href="/setup/"
        />
        <SettingsRow title="Privacy" href="/privacy/" />
        <SettingsRow title="Version" value={getEnv().version} />
      </SettingsGroup>
      <p className="mt-[18px] text-center text-[11.5px] leading-normal text-text-muted">
        Your routine lives on this phone.
      </p>

      {overlay === "reset" ? (
        <ResetTimeSheet
          value={settings.resetAt}
          survivalName={settings.survivalName}
          onClose={() => setOverlay(null)}
          onSave={(resetAt) => {
            setOverlay(null);
            set({ resetAt }, `The day now resets at ${formatHHMM12(resetAt)}`);
          }}
        />
      ) : null}
      {overlay === "rename-survival" ? (
        <PromptDialog
          title="What to call it"
          label="Name for Survival Mode"
          initialValue={settings.survivalName}
          maxLength={40}
          error={renameError ? <InlineError error={renameError} pageId={PAGE} /> : undefined}
          onCancel={() => setOverlay(null)}
          onSubmit={(survivalName) =>
            void run(updateSettings(defaultContext(), { survivalName }), {
              onInputError: setRenameError,
            }).then((r) => {
              if (r.ok) setOverlay(null);
            })
          }
        />
      ) : null}
      {overlay === "default-level" ? (
        <Sheet title={`Default ${settings.survivalName} plan`} onClose={() => setOverlay(null)}>
          <div className="flex flex-wrap gap-[7px]">
            {SURVIVAL_LEVELS.map((level) => {
              const plan = survivalPlanFor(org.plans, level);
              return (
                <ChoiceChip
                  key={level}
                  selected={settings.defaultLevel === level}
                  disabled={!plan}
                  onClick={() => {
                    setOverlay(null);
                    set({ defaultLevel: level });
                  }}
                >
                  {plan?.name ?? `Level ${level} (no plan)`}
                </ChoiceChip>
              );
            })}
          </div>
        </Sheet>
      ) : null}
      {overlay === "export" ? (
        <ExportSheet
          pageId={PAGE}
          includesArchive={settings.exportArchive}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      <TabBar />
    </ScreenRoot>
  );
}
