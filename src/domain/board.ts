import { assertNever } from './assert.ts';
import type { Point, Rect, Size } from './geometry.ts';
import type { NoteId } from './ids.ts';
import type { Note } from './note.ts';

export interface BoardState {
  readonly notes: readonly Note[];
  /** z for the next note brought to front or created. Single owner of stacking order. */
  readonly nextZ: number;
}

export const initialBoardState: BoardState = { notes: [], nextZ: 1 };

export type BoardAction =
  | { readonly type: 'note/created'; readonly id: NoteId; readonly rect: Rect }
  | { readonly type: 'note/broughtToFront'; readonly id: NoteId }
  /** `position` is the note's new top-left in board coordinates; the caller keeps it on screen. */
  | { readonly type: 'note/moved'; readonly id: NoteId; readonly position: Point }
  /**
   * `size` is the note's new width and height; the caller keeps it at least the minimum and on
   * screen.
   */
  | { readonly type: 'note/resized'; readonly id: NoteId; readonly size: Size }
  | { readonly type: 'note/deleted'; readonly id: NoteId }
  /** `text` is the note's whole new text. */
  | { readonly type: 'note/textChanged'; readonly id: NoteId; readonly text: string };

/**
 * Every update keeps the identity of the notes it doesn't change, so memoized note components
 * skip re-rendering them.
 */
export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'note/created': {
      const note: Note = { id: action.id, rect: action.rect, z: state.nextZ, text: '' };
      return { notes: [...state.notes, note], nextZ: state.nextZ + 1 };
    }
    case 'note/broughtToFront': {
      const target = state.notes.find((note) => note.id === action.id);
      if (target === undefined) return state;
      return {
        notes: state.notes.map((note) => (note === target ? { ...note, z: state.nextZ } : note)),
        nextZ: state.nextZ + 1,
      };
    }
    case 'note/moved': {
      const target = state.notes.find((note) => note.id === action.id);
      if (target === undefined) return state;
      const { x, y } = action.position;
      // A move the caller pinned in place returns the same state, so nothing re-renders.
      if (target.rect.x === x && target.rect.y === y) return state;
      return {
        notes: state.notes.map((note) =>
          note === target ? { ...note, rect: { ...note.rect, x, y } } : note,
        ),
        nextZ: state.nextZ,
      };
    }
    case 'note/resized': {
      const target = state.notes.find((note) => note.id === action.id);
      if (target === undefined) return state;
      const { width, height } = action.size;
      // A resize the caller pinned returns the same state, so nothing re-renders.
      if (target.rect.width === width && target.rect.height === height) return state;
      return {
        notes: state.notes.map((note) =>
          note === target ? { ...note, rect: { ...note.rect, width, height } } : note,
        ),
        nextZ: state.nextZ,
      };
    }
    case 'note/deleted': {
      const target = state.notes.find((note) => note.id === action.id);
      if (target === undefined) return state;
      return { notes: state.notes.filter((note) => note !== target), nextZ: state.nextZ };
    }
    case 'note/textChanged': {
      const target = state.notes.find((note) => note.id === action.id);
      if (target === undefined) return state;
      // Unchanged text returns the same state, so nothing re-renders and nothing is saved.
      if (target.text === action.text) return state;
      return {
        notes: state.notes.map((note) => (note === target ? { ...note, text: action.text } : note)),
        nextZ: state.nextZ,
      };
    }
    default:
      return assertNever(action);
  }
}
