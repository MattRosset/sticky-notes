import type { Note } from '../domain/note.ts';

/**
 * What end-to-end tests read from the running app: the notes as the reducer holds them. It exists
 * only in development builds (see PersistedBoard) and has no way to change anything.
 */
export interface BoardReadSeam {
  readonly notes: () => readonly Note[];
}

declare global {
  interface Window {
    __stickyNotes?: BoardReadSeam;
  }
}

/** Publishes `notes` on window; the returned function removes it unless a newer one replaced it. */
export function exposeNotes(notes: readonly Note[]): () => void {
  const seam: BoardReadSeam = { notes: () => notes };
  window.__stickyNotes = seam;
  return () => {
    if (window.__stickyNotes === seam) delete window.__stickyNotes;
  };
}
