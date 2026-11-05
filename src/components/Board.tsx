import { useCallback, useRef, type Dispatch } from 'react';
import type { BoardAction } from '../domain/board.ts';
import type { Size } from '../domain/geometry.ts';
import type { Note } from '../domain/note.ts';
import styles from './Board.module.css';
import { NoteView } from './NoteView.tsx';

interface BoardProps {
  readonly notes: readonly Note[];
  readonly dispatch: Dispatch<BoardAction>;
}

export function Board({ notes, dispatch }: BoardProps) {
  const boardRef = useRef<HTMLElement>(null);

  // Empty deps on purpose: a new getBounds on every render would re-render every memoized note.
  const getBounds = useCallback((): Size => {
    const board = boardRef.current;
    // Only reachable from a pointer handler, which needs the board mounted.
    if (board === null) throw new Error('Board is not mounted');
    return { width: board.clientWidth, height: board.clientHeight };
  }, []);

  return (
    <main ref={boardRef} className={styles.board} aria-label="Sticky notes board">
      {notes.map((note) => (
        <NoteView key={note.id} note={note} dispatch={dispatch} getBounds={getBounds} />
      ))}
    </main>
  );
}
