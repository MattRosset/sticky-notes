import type { Dispatch } from 'react';
import type { BoardAction } from '../domain/board.ts';
import type { NoteId } from '../domain/ids.ts';
import type { Note } from '../domain/note.ts';
import { useBoardGesture } from '../interaction/useBoardGesture.ts';
import styles from './Board.module.css';
import { NoteView } from './NoteView.tsx';
import { rectStyle } from './rectStyle.ts';

interface BoardProps {
  readonly notes: readonly Note[];
  readonly dispatch: Dispatch<BoardAction>;
  readonly createNoteId: () => NoteId;
}

export function Board({ notes, dispatch, createNoteId }: BoardProps) {
  const { handlers, preview } = useBoardGesture(notes, dispatch, createNoteId);

  return (
    <main className={styles.board} aria-label="Sticky notes board" {...handlers}>
      {notes.map((note) => (
        <NoteView key={note.id} note={note} />
      ))}
      {preview !== null && (
        <div className={styles.preview} data-testid="creation-preview" style={rectStyle(preview)} />
      )}
    </main>
  );
}
