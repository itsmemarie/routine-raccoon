import { toAppError, type AppError } from "@/lib/errors/app-error";
import { err, ok, type Result } from "@/lib/errors/result";
import { RoutineDb } from "./schema";

let instance: RoutineDb | undefined;

/** The app-wide database. Tests create their own `new RoutineDb(uniqueName)` instead. */
export function getDb(): RoutineDb {
  instance ??= new RoutineDb();
  return instance;
}

/**
 * Opens the database and asks the browser/WebView to keep it (no eviction under storage
 * pressure). Failure → RR-DB-001 (or RR-DB-004 for a failed upgrade), shown full-screen by
 * the shell's DatabaseGate.
 */
export async function openDb(db: RoutineDb = getDb()): Promise<Result<RoutineDb, AppError>> {
  try {
    await db.open();
  } catch (error) {
    return err(toAppError(error, "RR-DB-001"));
  }
  try {
    if (typeof navigator !== "undefined" && "storage" in navigator && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Persistence is best-effort: the database works without it. Not a user-facing failure.
  }
  return ok(db);
}
