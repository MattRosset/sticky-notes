import type { Dispatch } from 'react';
import type { BoardAction } from '../domain/board.ts';
import type { Note } from '../domain/note.ts';
import { useBoardGesture } from '../interaction/useBoardGesture.ts';
import styles from './Board.module.css';
import { NoteView } from './NoteView.tsx';

interface BoardProps {
  readonly notes: readonly Note[];
  readonly dispatch: Dispatch<BoardAction>;
}

export function Board({ notes, dispatch }: BoardProps) {
  const gestureHandlers = useBoardGesture(notes, dispatch);

  return (
    <main className={styles.board} aria-label="Sticky notes board" {...gestureHandlers}>
      {notes.map((note) => (
        <NoteView key={note.id} note={note} />
      ))}
    </main>
  );
}
