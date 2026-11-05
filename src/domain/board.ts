import { assertNever } from './assert.ts';
import type { Rect } from './geometry.ts';
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
  | { readonly type: 'note/broughtToFront'; readonly id: NoteId };

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
    default:
      return assertNever(action);
  }
}
