import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PAGES, type PageId } from "@/lib/errors/pages";
import { renderErrorDocs } from "@/scripts/generate-error-docs";

/**
 * Architecture guardrails (TECH_SPEC §4 "Architecture"). These encode the product requirement
 * that every page carries error codes, so a new screen can't ship without them.
 */
const APP_DIR = join(process.cwd(), "app");

function findPages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return findPages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

function routeOf(pageFile: string): string {
  const rel = relative(APP_DIR, pageFile).split(sep).slice(0, -1).join("/");
  return rel === "" ? "/" : `/${rel}`;
}

const pageIdByRoute = new Map<string, PageId>();
for (const [id, page] of Object.entries(PAGES) as [PageId, (typeof PAGES)[PageId]][]) {
  if (page.route !== null) pageIdByRoute.set(page.route, id);
}

const pageFiles = findPages(APP_DIR);

describe("every route carries error codes", () => {
  it("finds the routes", () => {
    expect(pageFiles.length).toBe(pageIdByRoute.size);
  });

  it.each(pageFiles.map((file) => [routeOf(file), file]))(
    "%s is registered with a page ID",
    (route) => {
      expect(pageIdByRoute.has(route)).toBe(true);
    },
  );

  it.each(pageFiles.map((file) => [routeOf(file), file]))(
    "%s has an error.tsx that renders RouteError with its page ID",
    (route, file) => {
      const errorFile = join(file, "..", "error.tsx");
      expect(existsSync(errorFile)).toBe(true);
      const source = readFileSync(errorFile, "utf8");
      expect(source).toContain('"use client"');
      expect(source).toContain("RouteError");
      expect(source).toContain(`pageId="${pageIdByRoute.get(route)}"`);
    },
  );

  it("the root shell has global-error.tsx (P00) and not-found.tsx (RR-APP-003)", () => {
    expect(readFileSync(join(APP_DIR, "global-error.tsx"), "utf8")).toContain('pageId="P00"');
    expect(readFileSync(join(APP_DIR, "not-found.tsx"), "utf8")).toContain("RR-APP-003");
  });

  it("every registered route has a page", () => {
    const routes = new Set(pageFiles.map(routeOf));
    for (const route of pageIdByRoute.keys()) expect(routes.has(route)).toBe(true);
  });
});

describe("generated docs", () => {
  it("docs/ERROR_CODES.md is up to date (run npm run errors:doc)", () => {
    const current = readFileSync(join(process.cwd(), "docs", "ERROR_CODES.md"), "utf8");
    expect(current).toBe(renderErrorDocs());
  });
});
