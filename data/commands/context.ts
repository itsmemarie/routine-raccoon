import { getDb } from "@/data/db/client";
import type { RoutineDb } from "@/data/db/schema";

/**
 * Everything a command needs from the outside world, injected so integration tests can use a
 * private database, a fixed clock and predictable ids.
 */
export interface CommandContext {
  readonly db: RoutineDb;
  readonly now: () => Date;
  readonly newId: () => string;
}

export function defaultContext(): CommandContext {
  return { db: getDb(), now: () => new Date(), newId: () => crypto.randomUUID() };
}
