/** Collapses a burst of changes into one save. */
export interface SaveScheduler<T> {
  /** Makes `state` the one to save and restarts the wait. */
  readonly schedule: (state: T) => void;
  /** Saves the waiting state now, if there is one. */
  readonly flush: () => void;
}

/**
 * Trailing debounce: each `schedule` replaces the waiting state and restarts a `delayMs` timer;
 * when it fires, only the latest state is saved. A failed save goes to `onError`, so it never
 * becomes an unhandled rejection.
 */
export function createSaveScheduler<T>(
  save: (state: T) => Promise<void>,
  delayMs: number,
  onError: (error: unknown) => void,
): SaveScheduler<T> {
  // Boxed, so a state that is itself falsy still counts as waiting.
  let waiting: { readonly state: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (waiting === null) return;
    const { state } = waiting;
    waiting = null;
    save(state).catch(onError);
  };

  return {
    schedule: (state) => {
      waiting = { state };
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
