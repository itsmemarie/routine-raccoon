"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScreenHeader, ScreenRoot } from "@/components/ui/screen";
import { getEnv } from "@/lib/env";
import { ALL_ERROR_CODES, ERROR_CODES, type ErrorArea } from "@/lib/errors/codes";
import { formatDiagnostics } from "@/lib/telemetry/diagnostics";

const PAGE = "P11" as const;

/** Explainer copy (prototype Help screen, updated for the handoff decisions). */
const GUIDE: readonly (readonly [string, string])[] = [
  [
    "Day Plans",
    "A Day Plan is one version of your day. The primary one is the full thing. The Survival Mode plans are shorter versions of the same day, for when the full one isn't going to happen.",
  ],
  [
    "Sections",
    "Sections group tasks inside a Day Plan: Morning, Smash it, Wind down. Each has a start time, a colour and its own repeats. A section can sit in several Day Plans at once; change it once and it changes everywhere.",
  ],
  [
    "Survival Mode",
    "Pick a level from Today's plan. Today switches to that level's own plan and every task runs at its smaller version. A Survival Mode Day still counts as showing up.",
  ],
  [
    "Paste a list",
    "In New task, paste two or more lines into the name and choose: each line its own task, or one task with the rest as its steps. Indented lines become steps.",
  ],
  [
    "Nothing is lost",
    "Archiving keeps history. Everything you add, edit or tick is written to the Log and included in Export all data.",
  ],
];

const AREA_NAMES: Record<ErrorArea, string> = {
  APP: "App",
  DB: "Data on this phone",
  NET: "Connection",
  SYNC: "Backup",
  AUTH: "Account",
  VAL: "Checking what you typed",
  IMP: "Pasting a list",
  MED: "Video",
  TMR: "Timer",
  NTF: "Notifications",
  PLAT: "Phone features",
  EXP: "Export",
  AST: "Drafting help",
};

/**
 * Help (P11): includes the error-code reference, rendered from the same registry the app uses,
 * so any code a user sees can be looked up here (TECH_SPEC §1.5 rule 8), plus Copy diagnostics.
 */
export function HelpScreen() {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const areas = [...new Set(ALL_ERROR_CODES.map((code) => ERROR_CODES[code].area))];

  const copyDiagnostics = async () => {
    const env = getEnv();
    try {
      await navigator.clipboard.writeText(
        formatDiagnostics({ version: env.version, env: env.appEnv, now: new Date() }),
      );
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <ScreenHeader title="Help" fallback="/settings/" />
      <div className="flex flex-col gap-5 px-3.5">
        <section
          aria-labelledby="how-heading"
          className="rounded-card border border-border bg-surface p-4"
        >
          <h2 id="how-heading" className="font-display text-lg font-bold tracking-[-0.02em]">
            How it works
          </h2>
          {GUIDE.map(([heading, body]) => (
            <div key={heading}>
              <h3 className="mt-4 font-display text-[15px] font-bold text-ink">{heading}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </section>
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em]">
            Something went wrong?
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
            Every problem shows a code like{" "}
            <span className="font-mono text-[12px]">RR-DB-002 · P01</span>. The first part says what
            went wrong, the second which screen it happened on. Copy the diagnostics below to share
            them.
          </p>
          <Button variant="tint" className="mt-3 w-full" onClick={() => void copyDiagnostics()}>
            {copied === "done"
              ? "Diagnostics copied"
              : copied === "failed"
                ? "Couldn't copy, try again"
                : "Copy diagnostics"}
          </Button>
        </section>

        <section aria-labelledby="codes-heading">
          <h2 id="codes-heading" className="font-display text-lg font-bold tracking-[-0.02em]">
            Error codes
          </h2>
          <div className="mt-2 flex flex-col gap-4">
            {areas.map((area) => (
              <div key={area}>
                <h3 className="text-[10.5px] font-semibold tracking-[0.12em] text-text-muted uppercase">
                  {AREA_NAMES[area]}
                </h3>
                <dl className="mt-1.5 divide-y divide-border rounded-card border border-border bg-surface">
                  {ALL_ERROR_CODES.filter((code) => ERROR_CODES[code].area === area).map((code) => (
                    <div key={code} className="px-3.5 py-3" id={code}>
                      <dt className="flex items-baseline gap-2">
                        <span className="font-mono text-[11.5px] text-primary-dark">{code}</span>
                        <span className="text-[13px] font-semibold text-ink">
                          {ERROR_CODES[code].title}
                        </span>
                      </dt>
                      <dd className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                        {ERROR_CODES[code].userMessage}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ScreenRoot>
  );
}
