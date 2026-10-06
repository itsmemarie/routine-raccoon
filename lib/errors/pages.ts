import type { ErrorCode } from "./codes";

/**
 * Page registry (TECH_SPEC §1.4–1.5). Every screen has a stable page ID shown next to any error
 * code on that screen ("RR-DB-002 · P01"), so a code read out by the user points to one place.
 *
 * `tests/architecture.test.ts` fails the build if an `app/**\/page.tsx` exists without an entry
 * here, or without a sibling `error.tsx` that passes the same page ID.
 */

/** Codes any page can surface: crashes, storage, network. */
export const COMMON_CODES = [
  "RR-APP-001",
  "RR-APP-002",
  "RR-APP-005",
  "RR-DB-001",
  "RR-DB-002",
  "RR-DB-003",
  "RR-DB-006",
  "RR-NET-001",
  "RR-NET-002",
  "RR-NET-003",
  "RR-NET-004",
] as const satisfies readonly ErrorCode[];

export interface PageDefinition {
  /** Route as served by the static export, without trailing slash. `null` for the root shell. */
  readonly route: string | null;
  readonly name: string;
  /** Codes specific to this page, on top of COMMON_CODES. */
  readonly codes: readonly ErrorCode[];
}

export const PAGES = {
  P00: { route: null, name: "App shell", codes: ["RR-APP-006", "RR-DB-004", "RR-APP-003"] },
  P01: {
    route: "/",
    name: "Today",
    codes: ["RR-DB-005", "RR-TMR-001", "RR-SYNC-001", "RR-VAL-001"],
  },
  P02: {
    route: "/task",
    name: "Task detail",
    codes: ["RR-APP-004", "RR-DB-005", "RR-MED-001", "RR-TMR-001", "RR-VAL-006"],
  },
  P03: {
    route: "/task/edit",
    name: "New / edit task",
    codes: [
      "RR-APP-004",
      "RR-DB-005",
      "RR-VAL-001",
      "RR-VAL-002",
      "RR-VAL-003",
      "RR-VAL-004",
      "RR-IMP-001",
      "RR-IMP-002",
      "RR-AST-001",
      "RR-AST-002",
    ],
  },
  P04: {
    route: "/section/edit",
    name: "Add / edit section",
    codes: ["RR-APP-004", "RR-DB-005", "RR-VAL-001", "RR-VAL-004"],
  },
  P05: {
    route: "/plans/sections",
    name: "Sections manager",
    codes: ["RR-APP-004", "RR-DB-005", "RR-VAL-005", "RR-VAL-006"],
  },
  P06: {
    route: "/settings",
    name: "Settings",
    codes: ["RR-VAL-001", "RR-VAL-004", "RR-VAL-005", "RR-NTF-001", "RR-NTF-002", "RR-EXP-001"],
  },
  P07: { route: "/progress", name: "Progress", codes: ["RR-DB-005"] },
  P08: { route: "/log", name: "Log", codes: ["RR-APP-004", "RR-DB-005"] },
  P09: { route: "/archive", name: "Archive", codes: ["RR-DB-005"] },
  P10: { route: "/day-complete", name: "Day complete", codes: ["RR-DB-005"] },
  P11: { route: "/help", name: "Help", codes: [] },
  P12: { route: "/privacy", name: "Privacy", codes: [] },
  P13: {
    route: "/auth",
    name: "Sign in",
    codes: [
      "RR-AUTH-001",
      "RR-AUTH-002",
      "RR-AUTH-003",
      "RR-AUTH-004",
      "RR-AUTH-005",
      "RR-AUTH-006",
      "RR-AUTH-008",
      "RR-SYNC-004",
    ],
  },
  P14: {
    route: "/account",
    name: "Account",
    codes: [
      "RR-AUTH-004",
      "RR-AUTH-007",
      "RR-AUTH-008",
      "RR-SYNC-001",
      "RR-SYNC-002",
      "RR-SYNC-003",
      "RR-SYNC-004",
      "RR-EXP-001",
    ],
  },
  P15: { route: "/setup", name: "Setup", codes: ["RR-VAL-001", "RR-VAL-002"] },
} as const satisfies Record<string, PageDefinition>;

export type PageId = keyof typeof PAGES;

export const ALL_PAGE_IDS = Object.keys(PAGES) as PageId[];

/** All codes a page can show: its own plus the common set. */
export function codesForPage(pageId: PageId): readonly ErrorCode[] {
  return [...COMMON_CODES, ...PAGES[pageId].codes];
}
