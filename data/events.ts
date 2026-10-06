/**
 * Tiny in-process event bus. Commands emit `local-write` after a successful commit; the sync
 * scheduler listens and pushes (debounced). Keeping it here avoids commands importing sync.
 */
type Listener = (command: string) => void;

const listeners = new Set<Listener>();

export function onLocalWrite(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitLocalWrite(command: string): void {
  for (const listener of listeners) {
    try {
      listener(command);
    } catch (error) {
      // A broken listener must not undo a committed write; surface it in the console only.
      console.error("local-write listener failed", error);
    }
  }
}
