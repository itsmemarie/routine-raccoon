import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** A grouped list of settings rows (handoff screen 15: white card, hairline dividers). */
export function SettingsGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-2.5 divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

function RowBody({
  title,
  description,
  value,
  valueTone,
  chevron,
}: {
  title: string;
  description?: string | undefined;
  value?: ReactNode;
  valueTone: "accent" | "muted";
  chevron: boolean;
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-[11.5px] font-medium text-text-muted">
            {description}
          </span>
        ) : null}
      </span>
      {value !== undefined ? (
        <span
          className={`shrink-0 text-[13px] font-semibold ${valueTone === "accent" ? "text-primary" : "text-text-muted"}`}
        >
          {value}
        </span>
      ) : null}
      {chevron ? (
        <ChevronRight
          size={15}
          strokeWidth={1.8}
          className="shrink-0 text-text-faint"
          aria-hidden
        />
      ) : null}
    </>
  );
}

const ROW = "flex min-h-[52px] w-full items-center gap-3 px-[15px] py-3 text-left";

/** A tappable row that navigates (`href`) or acts (`onClick`). */
export function SettingsRow({
  title,
  description,
  value,
  valueTone = "muted",
  href,
  onClick,
}: {
  title: string;
  description?: string;
  value?: ReactNode;
  valueTone?: "accent" | "muted";
  href?: string;
  onClick?: () => void;
}) {
  if (href) {
    return (
      <Link href={href} className={ROW}>
        <RowBody
          title={title}
          description={description}
          value={value}
          valueTone={valueTone}
          chevron
        />
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={ROW}>
        <RowBody
          title={title}
          description={description}
          value={value}
          valueTone={valueTone}
          chevron={false}
        />
      </button>
    );
  }
  return (
    <div className={ROW}>
      <RowBody
        title={title}
        description={description}
        value={value}
        valueTone={valueTone}
        chevron={false}
      />
    </div>
  );
}
