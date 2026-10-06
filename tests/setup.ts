// Global test setup (TECH_SPEC §4).
// - fake-indexeddb gives Dexie a spec-compliant IndexedDB in Node.
// - jest-dom adds DOM matchers for component tests.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
