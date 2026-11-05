import { assertNever } from './assert.ts';
import type { Point, Rect } from './geometry.ts';
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
  | { readonly type: 'note/moved'; readonly id: NoteId; readonly position: Point };

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
    default:
      return assertNever(action);
  }
}
