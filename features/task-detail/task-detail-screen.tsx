"use client";

import {
  ChevronLeft,
  Clock,
  Copy,
  History,
  Layers,
  Link2,
  ListTree,
  MapPin,
  MoreHorizontal,
  Pencil,
  Repeat,
  SkipForward,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SectionBoundary } from "@/components/errors/section-boundary";
import { ConfirmDialog } from "@/components/ui/confirm";
import { InlineText } from "@/components/ui/inline-text";
import { GroupHeading } from "@/components/ui/layout";
import { MenuButton } from "@/components/ui/menu";
import { useBack } from "@/components/ui/navigation";
import { ScreenRoot } from "@/components/ui/screen";
import { useToastStore } from "@/components/ui/toast-store";
import { defaultContext } from "@/data/commands/context";
import { skipTaskToday, tickTask, toggleStep, untickTask } from "@/data/commands/day";
import { deleteTask, duplicateTask, patchTask } from "@/data/commands/tasks";
import { useEffectiveDayKey } from "@/data/hooks/use-day-key";
import { useTaskDetail } from "@/data/hooks/use-task-detail";
import { displayMinutes } from "@/domain/duration";
import { skipRunLabel } from "@/domain/progress";
import { recurrenceLabel } from "@/domain/recurrence";
import { AppError } from "@/lib/errors/app-error";
import { copyText } from "@/lib/platform/files";
import { showToast, useCopyMove, useRun } from "@/features/common";
import { useTimerControls } from "@/features/timer";
import { StepsCard } from "./steps-card";
import { VideoEmbed } from "./video-embed";

const PAGE = "P02" as const;
const ICON = { size: 15, strokeWidth: 1.6 } as const;

function Tag({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-canvas px-[11px] py-[5px] text-[11.5px] font-semibold text-text-muted">
      {icon}
      {children}
    </span>
  );
}

function InfoRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-[11px] border-b border-border px-[15px] py-[13px] last:border-b-0">
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[9px] bg-screen text-text-muted">
        {icon}
      </span>
      <span className="flex-1 text-[13px] font-medium text-text-muted">{label}</span>
      <span className={`text-right text-[13px] font-semibold ${tone ?? "text-ink"}`}>{value}</span>
    </div>
  );
}

/**
 * Task detail (P02, handoff screens 6–9). Read mode hides empty fields; every visible field
 * edits in place. Steps tick for today only.
 */
export function TaskDetailScreen() {
  const params = useSearchParams();
  const taskId = params.get("id");
  if (!taskId) throw new AppError("RR-APP-004", { context: { pageId: PAGE, param: "id" } });
  return <TaskDetail taskId={taskId} />;
}

function TaskDetail({ taskId }: { taskId: string }) {
  const router = useRouter();
  const back = useBack("/");
  const run = useRun(PAGE);
  const dayKey = useEffectiveDayKey();
  const detail = useTaskDetail(taskId, dayKey);
  const timer = useTimerControls(PAGE, dayKey);
  const copyMove = useCopyMove(PAGE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Set while deleting, so the row vanishing doesn't flash (and report) RR-DB-005.
  const [leaving, setLeaving] = useState(false);

  if (detail === null && leaving) return <ScreenRoot pageId={PAGE} />;
  if (detail === null) {
    throw new AppError("RR-DB-005", { context: { entity: "task", pageId: PAGE } });
  }
  if (!detail || !dayKey) return <ScreenRoot pageId={PAGE} />;

  const { task, section, plans, occurrence, today, settings } = detail;
  const ctx = defaultContext();
  const minutes = today?.minutes ?? displayMinutes(task, false);
  const shrunk = today?.shrunk ?? false;
  const done = today?.done ?? occurrence?.status === "done";
  const checked = new Set(occurrence?.checked_step_ids ?? []);
  const smallerSteps = task.smaller_versions.steps ?? [];
  const stepsShown = shrunk && smallerSteps.length > 0 ? smallerSteps : task.steps;
  const greyFrom = shrunk && smallerSteps.length === 0 ? 2 : Number.POSITIVE_INFINITY;
  const running = timer.current?.taskId === task.id;
  const hasNotes = Boolean(task.mantra || task.notes || task.video_url);

  const patch = (fields: Parameters<typeof patchTask>[1]["patch"]) =>
    void run(patchTask(ctx, { taskId: task.id, patch: fields }));

  const onDone = async () => {
    if (done) {
      await run(untickTask(ctx, { taskId: task.id, dayKey }), {
        success: `Un-ticked ${task.name}`,
      });
      return;
    }
    const result = await run(tickTask(ctx, { taskId: task.id, dayKey }));
    if (!result.ok) return;
    if (running) await timer.stop({ quiet: true });
    useToastStore.getState().show({
      message: `Ticked ${task.name}`,
      durationMs: 5000,
      action: {
        label: "Undo",
        onPress: () => void run(untickTask(defaultContext(), { taskId: task.id, dayKey })),
      },
    });
    router.push("/");
  };

  const infoRows = [
    {
      icon: <Repeat size={12} strokeWidth={1.7} />,
      label: "Frequency",
      value: capitalise(recurrenceLabel(task.recurrence)),
    },
    ...(section
      ? [
          {
            icon: <ListTree size={12} strokeWidth={1.7} />,
            label: "Section",
            value: section.start_time ? `${section.name} · ${section.start_time}` : section.name,
          },
        ]
      : []),
    ...(detail.alsoIn.length > 0
      ? [
          {
            icon: <Layers size={12} strokeWidth={1.7} />,
            label: "Also in",
            value: detail.alsoIn.map((p) => p.name).join(", "),
            tone: "text-primary",
          },
        ]
      : []),
    ...(skipRunLabel(detail.skipRun)
      ? [
          {
            icon: <span className="block size-2 rounded-[3px] bg-text-on-dark" />,
            label: "Skipped",
            value: skipRunLabel(detail.skipRun) ?? "",
            tone: "text-primary-dark",
          },
        ]
      : []),
  ];

  return (
    <ScreenRoot pageId={PAGE} className="pb-10">
      <header className="sticky top-0 z-30 flex min-h-[62px] items-center gap-2.5 border-b border-border bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={back}
          className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-[13px] font-semibold text-text-muted"
        >
          <ChevronLeft size={18} strokeWidth={1.8} aria-hidden /> Today
        </button>
        <Link
          href={`/task/edit/?id=${encodeURIComponent(task.id)}`}
          className="ml-auto flex h-10 items-center rounded-full bg-primary px-[18px] text-[13px] font-bold text-white"
        >
          Edit
        </Link>
        <MenuButton
          label="More actions"
          triggerClassName="flex size-10 items-center justify-center rounded-full bg-canvas text-ink"
          trigger={<MoreHorizontal size={18} strokeWidth={1.8} aria-hidden />}
          items={[
            {
              label: "Edit task",
              icon: <Pencil {...ICON} />,
              onSelect: () => router.push(`/task/edit/?id=${encodeURIComponent(task.id)}`),
            },
            {
              label: "Duplicate",
              icon: <Layers {...ICON} />,
              onSelect: () =>
                void run(duplicateTask(ctx, { taskId: task.id }), { success: "Duplicated" }),
            },
            {
              label: "Copy to Day Plan or section",
              icon: <Copy {...ICON} />,
              onSelect: () =>
                copyMove.open({ kind: "task", taskId: task.id, sectionId: task.section_id }),
            },
            {
              label: "Copy link to task",
              icon: <Link2 {...ICON} />,
              onSelect: () =>
                void copyText(
                  `${window.location.origin}/task/?id=${encodeURIComponent(task.id)}`,
                ).then((copied) => showToast(copied ? "Link copied" : "Couldn't copy the link")),
            },
            {
              label: "View activity",
              icon: <History {...ICON} />,
              onSelect: () => router.push(`/log/?task=${encodeURIComponent(task.id)}`),
            },
            {
              label: "Skip today",
              icon: <SkipForward {...ICON} />,
              onSelect: () =>
                void run(skipTaskToday(ctx, { taskId: task.id, dayKey }), {
                  success: `Skipped ${task.name} for today`,
                }).then((r) => {
                  if (r.ok) router.push("/");
                }),
            },
            {
              label: "Delete task",
              icon: <Trash2 {...ICON} />,
              destructive: true,
              onSelect: () => setConfirmDelete(true),
            },
          ]}
        />
      </header>

      <div className="px-4 pt-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="-mt-1 flex size-11 shrink-0 items-center justify-center text-[30px]"
          >
            {task.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="sr-only">{task.name}</h1>
            <InlineText
              value={task.name}
              label="Task name"
              maxLength={80}
              onCommit={(name) => patch({ name })}
              className="font-display text-[24px] leading-[1.15] font-bold tracking-[-0.025em] text-ink"
            />
            <div className="mt-[9px] flex flex-wrap gap-1.5">
              {task.hard && !shrunk ? (
                <span className="rounded-md bg-tint px-[9px] py-[5px] text-[10.5px] font-bold tracking-[0.06em] text-primary-dark uppercase">
                  Hard
                </span>
              ) : null}
              {shrunk ? (
                <span className="rounded-md bg-primary-mid px-[9px] py-[5px] text-[10.5px] font-bold tracking-[0.06em] text-white uppercase">
                  Smaller version
                </span>
              ) : null}
              <Tag icon={<Clock size={12} strokeWidth={1.7} aria-hidden />}>
                {shrunk ? `${minutes} min · was ${task.minutes}` : `${minutes} min`}
              </Tag>
              {section ? (
                <Tag
                  icon={
                    <span
                      aria-hidden
                      className="block size-2 rounded-[3px]"
                      style={{ background: section.color }}
                    />
                  }
                >
                  {section.name}
                </Tag>
              ) : null}
              {plans[0] ? (
                <Tag icon={<ListTree size={12} strokeWidth={1.7} aria-hidden />}>
                  {plans.map((p) => p.name).join(", ")}
                </Tag>
              ) : null}
              {task.location ? (
                <Tag icon={<MapPin size={12} strokeWidth={1.7} aria-hidden />}>{task.location}</Tag>
              ) : null}
            </div>
          </div>
        </div>

        {shrunk && task.smaller_versions.text ? (
          <section
            aria-labelledby="smaller-heading"
            className="mt-5 rounded-[14px] bg-tint px-[15px] py-[13px]"
          >
            <h2
              id="smaller-heading"
              className="text-[10.5px] font-semibold tracking-[0.12em] text-survival-text uppercase"
            >
              {settings.survivalName} · the smaller version
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] whitespace-pre-line text-ink">
              {task.smaller_versions.text}
            </p>
          </section>
        ) : null}

        {hasNotes ? (
          <section aria-labelledby="notes-heading" className="mt-5">
            <GroupHeading id="notes-heading">Notes</GroupHeading>
            <div className="mt-[9px] rounded-[14px] border border-l-[3px] border-border border-l-primary bg-surface px-[15px] py-[13px]">
              {task.mantra ? (
                <InlineText
                  value={task.mantra}
                  label="Mantra"
                  maxLength={300}
                  onCommit={(mantra) => patch({ mantra })}
                  className="text-[13px] leading-normal font-bold text-primary"
                />
              ) : null}
              {task.notes ? (
                <InlineText
                  value={task.notes}
                  label="Notes"
                  multiline
                  rows={Math.min(8, Math.max(2, task.notes.split("\n").length))}
                  maxLength={4000}
                  onCommit={(notes) => patch({ notes })}
                  className={`text-[13.5px] leading-[1.55] text-ink-muted ${task.mantra ? "mt-[7px]" : ""}`}
                />
              ) : null}
              {task.video_url ? (
                <div className="mt-2">
                  <SectionBoundary pageId={PAGE} fallback="RR-MED-001">
                    <VideoEmbed url={task.video_url} pageId={PAGE} />
                  </SectionBoundary>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <StepsCard
          steps={stepsShown}
          checked={checked}
          greyFrom={greyFrom}
          editable={stepsShown === task.steps}
          note={
            shrunk && smallerSteps.length === 0 && task.steps.length > 2
              ? `On a ${settings.survivalName} day, just the first two steps.`
              : null
          }
          onToggle={(stepId, next) =>
            void run(toggleStep(ctx, { taskId: task.id, dayKey, stepId, checked: next }))
          }
          onEdit={(stepId, text) =>
            patch({
              steps: task.steps
                .map((s) => (s.id === stepId ? { ...s, text } : s))
                .filter((s) => s.text.trim() !== ""),
            })
          }
          onAdd={(text) => patch({ steps: [...task.steps, { text }] })}
        />

        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
          {infoRows.map((row) => (
            <InfoRow key={row.label} {...row} />
          ))}
        </div>

        {task.location ? (
          <section aria-labelledby="where-heading" className="mt-5">
            <GroupHeading id="where-heading">Where</GroupHeading>
            <div className="mt-[9px] flex items-center gap-2.5 rounded-[14px] border border-border bg-surface px-[15px] py-[13px] text-text-muted">
              <MapPin size={13} strokeWidth={1.7} aria-hidden />
              <InlineText
                value={task.location}
                label="Location"
                maxLength={120}
                placeholder="Where does it happen?"
                onCommit={(location) => patch({ location })}
                className="text-[13.5px] font-medium text-ink"
              />
            </div>
          </section>
        ) : null}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => (running ? void timer.stop() : timer.start(task))}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-card bg-tint text-[14.5px] font-bold text-primary-dark"
          >
            {running ? "Stop timer" : `Start ${minutes} min`}
          </button>
          <button
            type="button"
            onClick={() => void onDone()}
            className="flex min-h-[52px] flex-1 items-center justify-center rounded-card bg-primary text-[14.5px] font-bold text-white"
          >
            {done ? "Un-tick" : "Done"}
          </button>
        </div>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${task.name}”?`}
          body="The task and its steps are removed for good. You can skip it for today instead."
          confirmLabel="Delete task"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            setLeaving(true);
            void run(deleteTask(ctx, { taskId: task.id }), {
              success: `Deleted ${task.name}`,
            }).then((r) => {
              if (r.ok) router.replace("/");
              else setLeaving(false);
            });
          }}
        />
      ) : null}
      {copyMove.sheet}
      {timer.dialog}
    </ScreenRoot>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
