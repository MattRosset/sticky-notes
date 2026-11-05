import type { ProfilerOnRenderCallback } from 'react';

// Every note renders its own <Profiler> inside the memoized component. A Profiler wrapped around
// each note by the parent reports every note on every parent render, memoized or not, so it
// could not see the bug this seam exists to catch: notes re-rendering when they didn't change.
// Production builds never call onRender (React disables Profiler timing outside profiling builds).

let listener: ProfilerOnRenderCallback | null = null;

/** Passed to the <Profiler> inside every note. A no-op unless a test subscribes. */
export const onNoteRender: ProfilerOnRenderCallback = (...args) => {
  listener?.(...args);
};

/** Test seam: observe which notes render. Returns an unsubscribe function. */
export function subscribeNoteRenders(next: ProfilerOnRenderCallback): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}
