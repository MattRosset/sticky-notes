import type { Dispatch } from 'react';
import type { BoardAction } from '../domain/board.ts';
import type { NoteId } from '../domain/ids.ts';
import type { Note } from '../domain/note.ts';
import { useBoardGesture, type GestureView } from '../interaction/useBoardGesture.ts';
import styles from './Board.module.css';
import { NoteView } from './NoteView.tsx';
import { rectStyle } from './rectStyle.ts';
import { Trash, type TrashState } from './Trash.tsx';

interface BoardProps {
  readonly notes: readonly Note[];
  readonly dispatch: Dispatch<BoardAction>;
  readonly createNoteId: () => NoteId;
}

export function Board({ notes, dispatch, createNoteId }: BoardProps) {
  const { handlers, view, trashRef } = useBoardGesture(notes, dispatch, createNoteId);
  const preview = view.kind === 'creating' ? view.preview : null;

  return (
    <main
      className={styles.board}
      aria-label="Sticky notes board"
      data-gesture={view.kind}
      {...handlers}
    >
      <div className={styles.notes}>
        {notes.map((note) => (
          <NoteView key={note.id} note={note} />
        ))}
      </div>
      {preview !== null && (
        <div className={styles.preview} data-testid="creation-preview" style={rectStyle(preview)} />
      )}
      <Trash ref={trashRef} state={trashStateOf(view)} />
    </main>
  );
}

/** The trash only reacts to moving a note: resizing and creating never delete. */
function trashStateOf(view: GestureView): TrashState {
  if (view.kind !== 'moving') return 'rest';
  return view.overTrash ? 'armed' : 'active';
}
