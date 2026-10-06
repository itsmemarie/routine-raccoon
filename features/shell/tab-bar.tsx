"use client";

import { BarChart3, ListChecks, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", Icon: ListChecks },
  { href: "/progress/", label: "Progress", Icon: BarChart3 },
  { href: "/settings/", label: "Settings", Icon: SlidersHorizontal },
] as const;

/** Bottom tabs: Today · Progress · Settings (handoff screen 1). */
export function TabBar() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href.slice(0, -1));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[480px] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ href, label, Icon }) => {
        const isActive = active(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[12px] font-bold ${
              isActive ? "text-primary" : "text-text-muted"
            }`}
          >
            {isActive ? <span className="absolute top-0 h-[3px] w-6 rounded-b bg-primary" /> : null}
            <Icon size={20} strokeWidth={1.8} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
