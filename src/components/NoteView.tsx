import { memo, Profiler } from 'react';
import type { Note } from '../domain/note.ts';
import { noteTargetProps, resizeHandleProps } from '../interaction/useBoardGesture.ts';
import { noteEditorProps } from '../interaction/useNoteEditing.ts';
import styles from './NoteView.module.css';
import { rectStyle } from './rectStyle.ts';
import { onNoteRender } from './renderProbe.ts';

interface NoteViewProps {
  readonly note: Note;
  /** Whether the note shows its text editor. */
  readonly editing: boolean;
}

/**
 * Focuses the editor when it opens, with the caret after the text. Defined once, outside the
 * component: React calls a ref callback again whenever its identity changes, and a new one on
 * every render would move the caret to the end on every keystroke.
 */
function focusAtEnd(editor: HTMLTextAreaElement | null): void {
  if (editor === null) return;
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

function NoteBody({ note, editing }: NoteViewProps) {
  if (editing) {
    return (
      <textarea
        className={styles.editor}
        aria-label="Note text"
        placeholder="Type a note"
        // Uncontrolled: the editor keeps what is typed, and the board turns each change into a
        // state update. A controlled editor would need its own change handler, and notes take no
        // callbacks (see useNoteEditing).
        defaultValue={note.text}
        ref={focusAtEnd}
        {...noteEditorProps()}
      />
    );
  }
  if (note.text === '') return <p className={styles.placeholder}>Double-click to write</p>;
  return <p className={styles.text}>{note.text}</p>;
}

function NoteViewImpl({ note, editing }: NoteViewProps) {
  return (
    <Profiler id={note.id} onRender={onNoteRender}>
      <article
        className={styles.note}
        aria-label="Sticky note"
        {...noteTargetProps(note.id)}
        style={{ ...rectStyle(note.rect), zIndex: note.z }}
      >
        <NoteBody note={note} editing={editing} />
        <div className={styles.resizeHandle} {...resizeHandleProps()} />
      </article>
    </Profiler>
  );
}

/**
 * Default prop comparison: the props are the note and a boolean, and the reducer keeps unchanged
 * notes by identity, so only the note that changed, or started or stopped being edited,
 * re-renders. Pointer and editor input is handled by the board.
 */
export const NoteView = memo(NoteViewImpl);
