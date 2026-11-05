import { memo, Profiler } from 'react';
import type { Note } from '../domain/note.ts';
import { noteTargetProps } from '../interaction/useBoardGesture.ts';
import styles from './NoteView.module.css';
import { rectStyle } from './rectStyle.ts';
import { onNoteRender } from './renderProbe.ts';

interface NoteViewProps {
  readonly note: Note;
}

function NoteViewImpl({ note }: NoteViewProps) {
  return (
    <Profiler id={note.id} onRender={onNoteRender}>
      <article
        className={styles.note}
        aria-label="Sticky note"
        {...noteTargetProps(note.id)}
        style={{ ...rectStyle(note.rect), zIndex: note.z }}
      />
    </Profiler>
  );
}

/**
 * Default prop comparison: the only prop is the note, and the reducer keeps unchanged notes by
 * identity, so only the note that changed re-renders. Pointer input is handled by the board.
 */
export const NoteView = memo(NoteViewImpl);
