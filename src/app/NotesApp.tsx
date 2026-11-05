import { useEffect, useReducer, useState } from 'react';
import { Board } from '../components/Board.tsx';
import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import type { NoteId } from '../domain/ids.ts';
import type { NotesRepository } from '../persistence/notesRepository.ts';
import { createSaveScheduler } from './saveScheduler.ts';
import { exposeNotes } from './testSeam.ts';

/**
 * How long the board must stay unchanged before it is saved. A drag or a burst of typing changes
 * the state dozens of times a second; saving 300 ms after the last change writes each burst once,
 * and still saves almost as soon as the user's hand stops. Leaving the page does not wait for it:
 * pagehide saves what is waiting at once.
 */
export const SAVE_DELAY_MS = 300;

interface NotesAppProps {
  readonly repository: NotesRepository;
  readonly createNoteId: () => NoteId;
}

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly initial: BoardState };

/**
 * Loads the saved board, then shows it and saves its changes. Nothing is shown until the load
 * settles, so nobody can change a board that is about to be replaced by the saved one.
 */
export function NotesApp({ repository, createNoteId }: NotesAppProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    // A load that settles after this effect was cleaned up (unmounted, StrictMode's second run,
    // another repository) must not replace the board.
    let current = true;
    repository.load().then(
      (saved) => {
        if (current) setLoad({ status: 'ready', initial: saved ?? initialBoardState });
      },
      (error: unknown) => {
        // Storage that can't be read (blocked, disabled) still gets a working, empty board.
        console.error('Could not load the saved notes.', error);
        if (current) setLoad({ status: 'ready', initial: initialBoardState });
      },
    );
    return () => {
      current = false;
    };
  }, [repository]);

  if (load.status === 'loading') return null;
  return (
    <PersistedBoard initial={load.initial} repository={repository} createNoteId={createNoteId} />
  );
}

interface PersistedBoardProps extends NotesAppProps {
  readonly initial: BoardState;
}

function PersistedBoard({ initial, repository, createNoteId }: PersistedBoardProps) {
  const [state, dispatch] = useReducer(boardReducer, initial);
  const [scheduler] = useState(() =>
    createSaveScheduler<BoardState>(
      (next) => repository.save(next),
      SAVE_DELAY_MS,
      (error) => {
        console.error('Could not save the notes.', error);
      },
    ),
  );

  useEffect(() => {
    // Only changes are written. The loaded board is already in storage, and when what was stored
    // could not be read, it stays there untouched until the user changes something. The reducer
    // returns the same state object for an action that changes nothing, so identity says it.
    if (state !== initial) scheduler.schedule(state);
  }, [state, initial, scheduler]);

  useEffect(() => {
    // pagehide is the last event a page is sure to get when it is closed, reloaded or sent to the
    // back/forward cache; nothing waiting may be lost then, nor when the board unmounts.
    const onPageHide = (): void => {
      scheduler.flush();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      scheduler.flush();
    };
  }, [scheduler]);

  useEffect(() => {
    // End-to-end tests read the notes here instead of parsing the DOM. `import.meta.env.DEV` is
    // `false` in a production build, so the build drops this and the seam (scripts/check-bundle.ts
    // checks it).
    if (import.meta.env.DEV) return exposeNotes(state.notes);
  }, [state.notes]);

  return <Board notes={state.notes} dispatch={dispatch} createNoteId={createNoteId} />;
}
