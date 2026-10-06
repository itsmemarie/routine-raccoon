import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Filter chip. Active = ink fill (handoff: "active filter chip"). */
export function Chip({
  active = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[12.5px] font-semibold whitespace-nowrap ${
        active ? "border-ink bg-ink text-white" : "border-border bg-surface text-text-muted"
      } ${className}`}
      {...props}
    />
  );
}

/**
 * Choice chip used in forms and sheets (prototype `chipRed`): primary fill when selected.
 * `dot` shows a section colour swatch before the label.
 */
export function ChoiceChip({
  selected = false,
  dot,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  dot?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-[15px] text-[12.5px] whitespace-nowrap ${
        selected
          ? "bg-primary font-semibold text-white"
          : "border border-border bg-surface font-medium text-text-muted"
      } ${className}`}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-[9px] shrink-0 rounded-[3px]"
          style={{ background: selected ? "var(--color-surface)" : dot }}
        />
      ) : null}
      {children}
    </button>
  );
}

/** Dashed "+ New …" chip that sits at the end of a chip row. */
export function AddChip({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex min-h-10 shrink-0 items-center rounded-full border-[1.5px] border-dashed border-border-strong bg-surface px-[14px] text-[12.5px] font-semibold text-text-muted ${className}`}
      {...props}
    />
  );
}
