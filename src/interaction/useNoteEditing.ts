import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import type { BoardAction } from '../domain/board.ts';
import type { NoteId } from '../domain/ids.ts';

/** Spread onto the text editor of the note being edited. */
export function noteEditorProps(): { readonly 'data-note-editor': true } {
  return { 'data-note-editor': true };
}

/** Whether `target` is a note's text editor (see noteEditorProps). */
export function isNoteEditor(target: EventTarget): target is HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement && target.hasAttribute('data-note-editor');
}

/** Spread onto the board: the editor's events bubble up to it. */
export interface NoteEditorHandlers {
  readonly onChange: (event: ChangeEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

export interface NoteEditing {
  /** The note whose text editor is open, or null. At most one note is edited at a time. */
  readonly editingId: NoteId | null;
  readonly startEditing: (id: NoteId) => void;
  readonly stopEditing: () => void;
  readonly handlers: NoteEditorHandlers;
}

/**
 * Which note is being edited, and the editor's input. The editor's events are handled on the
 * board, where they bubble, like pointer input: notes stay render-only, so a note receives no
 * callback whose identity could change and re-render every note.
 *
 * Every way out of editing keeps the text typed so far, because each keystroke is already in the
 * state: Escape blurs the editor, a blur ends editing, and a press anywhere else ends it too (the
 * board's gesture hook calls stopEditing, since it sees the press before focus moves).
 */
export function useNoteEditing(dispatch: Dispatch<BoardAction>): NoteEditing {
  const [editingId, setEditingId] = useState<NoteId | null>(null);
  return {
    editingId,
    startEditing: setEditingId,
    stopEditing: () => {
      setEditingId(null);
    },
    handlers: {
      onChange: (event) => {
        // Only the edited note has an editor, so the change is that note's text.
        if (editingId === null || !isNoteEditor(event.target)) return;
        dispatch({ type: 'note/textChanged', id: editingId, text: event.target.value });
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape' && isNoteEditor(event.target)) event.target.blur();
      },
      onBlur: (event) => {
        if (isNoteEditor(event.target)) setEditingId(null);
      },
    },
  };
}
