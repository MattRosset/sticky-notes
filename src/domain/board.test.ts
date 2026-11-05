import { describe, expect, it } from 'vitest';
import { boardReducer, initialBoardState, type BoardState } from './board.ts';
import type { Rect } from './geometry.ts';
import { asNoteId, type NoteId } from './ids.ts';

const rect: Rect = { x: 10, y: 20, width: 200, height: 150 };

function withNotes(...ids: readonly NoteId[]): BoardState {
  return ids.reduce(
    (state, id) => boardReducer(state, { type: 'note/created', id, rect }),
    initialBoardState,
  );
}

function deepFreeze(state: BoardState): BoardState {
  for (const note of state.notes) {
    Object.freeze(note.rect);
    Object.freeze(note);
  }
  Object.freeze(state.notes);
  return Object.freeze(state);
}

describe('boardReducer', () => {
  it('creates a note with the given id and rect, z from nextZ, empty text, and bumps nextZ', () => {
    const prev: BoardState = { notes: [], nextZ: 7 };
    const id = asNoteId('a');

    const next = boardReducer(prev, { type: 'note/created', id, rect });

    expect(next.notes).toEqual([{ id, rect, z: 7, text: '' }]);
    expect(next.nextZ).toBe(8);
  });

  it('keeps every existing note by identity', () => {
    const prev = withNotes(asNoteId('a'), asNoteId('b'));

    const next = boardReducer(prev, { type: 'note/created', id: asNoteId('c'), rect });

    // Control: a reducer that clones every note (map(n => ({...n}))) fails this.
    expect(next.notes[0]).toBe(prev.notes[0]);
    expect(next.notes[1]).toBe(prev.notes[1]);
  });

  it('does not mutate the previous state', () => {
    const prev = deepFreeze(withNotes(asNoteId('a'), asNoteId('b')));

    boardReducer(prev, { type: 'note/created', id: asNoteId('c'), rect });
    boardReducer(prev, { type: 'note/broughtToFront', id: asNoteId('a') });

    expect(prev.notes.length).toBe(2);
  });

  it('brings a note to front', () => {
    const first = asNoteId('a');
    const prev = withNotes(first, asNoteId('b'), asNoteId('c'));

    const next = boardReducer(prev, { type: 'note/broughtToFront', id: first });

    expect(next.notes[0]?.z).toBe(prev.nextZ);
    expect(next.nextZ).toBe(prev.nextZ + 1);
    expect(next.notes[1]).toBe(prev.notes[1]);
    expect(next.notes[2]).toBe(prev.notes[2]);
    expect(boardReducer(prev, { type: 'note/broughtToFront', id: asNoteId('missing') })).toBe(prev);
  });
});
