import type { ReactNode } from "react";

/** Group heading on forms and Settings (handoff: title scale, Outfit 700 18px, option 1A). */
export function GroupHeading({
  children,
  id,
  className = "",
  as: Tag = "h2",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      id={id}
      className={`font-display text-[18px] leading-[1.1] font-bold tracking-[-0.02em] text-ink ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Small uppercase label (handoff overline: 600 10.5px, 0.12em). */
export function Overline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`block text-[10.5px] font-semibold tracking-[0.12em] uppercase ${className || "text-text-muted"}`}
    >
      {children}
    </span>
  );
}

/** White card with a hairline border (handoff: radius 16–18). */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "ul";
}) {
  return (
    <Tag className={`rounded-[18px] border border-border bg-surface ${className}`}>{children}</Tag>
  );
}

/** Dark context card at the top of forms: "Creating in · Normal · primary Day Plan". */
export function ContextCard({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[11px] rounded-card bg-ink px-[15px] py-[13px]">
      <span aria-hidden className="size-[9px] shrink-0 rounded-[3px] bg-amber" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-medium tracking-[0.14em] text-text-on-dark uppercase">
          {label}
        </span>
        <span className="mt-[3px] block truncate text-[14.5px] font-bold text-white">{value}</span>
      </span>
      {action}
    </div>
  );
}

/** Dashed empty-state box. */
export function EmptyBox({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`rounded-card border-[1.5px] border-dashed border-border-strong p-4 text-center text-[12.5px] font-medium text-text-faint ${className}`}
    >
      {children}
    </p>
  );
}

/** Small round coloured marker (section colour). */
export function Dot({
  color,
  size = 8,
  ring = false,
}: {
  color: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-[3px] transition-shadow ${ring ? "shadow-target" : ""}`}
      style={{ width: size, height: size, background: color }}
    />
  );
}
