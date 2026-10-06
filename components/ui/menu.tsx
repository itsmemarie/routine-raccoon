"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly icon?: ReactNode;
}

/**
 * Popover menu (section ⋯, task ⋯). Opens below its trigger, closes on outside tap, Escape or
 * selection, and supports arrow-key navigation (WAI-ARIA menu button pattern).
 */
export function MenuButton({
  label,
  items,
  trigger,
  triggerClassName = "",
  align = "right",
}: {
  /** Accessible name of the trigger, e.g. "Section options". */
  label: string;
  items: readonly MenuItem[];
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]");
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && !menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [],
    );
    const index = entries.findIndex((el) => el === document.activeElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      entries.at(-1)?.focus();
    }
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKey}
          onClick={(event) => event.stopPropagation()}
          className={`absolute top-[calc(100%+4px)] z-40 flex w-[220px] animate-pop flex-col rounded-card bg-surface p-1.5 shadow-[0_14px_36px_rgba(15,14,14,0.16),0_0_0_1px_var(--color-border)] ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-left text-[13px] font-semibold hover:bg-screen focus-visible:bg-screen ${item.destructive ? "text-destructive" : "text-ink"}`}
            >
              {item.icon ? (
                <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
