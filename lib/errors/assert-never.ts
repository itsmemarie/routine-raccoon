/**
 * Exhaustiveness check for discriminated unions. If a new variant is added and a switch
 * doesn't handle it, this call stops compiling.
 */
export function assertNever(value: never, label = "value"): never {
  throw new Error(`Unhandled ${label}: ${JSON.stringify(value)}`);
}
