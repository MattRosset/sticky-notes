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
    boardReducer(prev, { type: 'note/moved', id: asNoteId('a'), position: { x: 300, y: 400 } });

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

  it('moves a note to the given position and keeps the others by identity', () => {
    const second = asNoteId('b');
    const prev = withNotes(asNoteId('a'), second, asNoteId('c'));

    const next = boardReducer(prev, { type: 'note/moved', id: second, position: { x: 300, y: 400 } });

    expect(next.notes[1]?.rect).toEqual({ x: 300, y: 400, width: rect.width, height: rect.height });
    expect(next.notes[1]?.z).toBe(prev.notes[1]?.z);
    expect(next.nextZ).toBe(prev.nextZ);
    expect(next.notes[0]).toBe(prev.notes[0]);
    expect(next.notes[2]).toBe(prev.notes[2]);
  });

  it('returns the same state for an unknown id or an unchanged position', () => {
    const id = asNoteId('a');
    const prev = withNotes(id);

    expect(
      boardReducer(prev, { type: 'note/moved', id: asNoteId('missing'), position: { x: 1, y: 2 } }),
    ).toBe(prev);
    expect(
      boardReducer(prev, { type: 'note/moved', id, position: { x: rect.x, y: rect.y } }),
    ).toBe(prev);
  });

  it('resizes a note, keeping its position and every other note by identity', () => {
    const first = asNoteId('a');
    const prev = withNotes(first, asNoteId('b'));

    const next = boardReducer(prev, {
      type: 'note/resized',
      id: first,
      size: { width: 300, height: 90 },
    });

    expect(next.notes[0]?.rect).toEqual({ x: 10, y: 20, width: 300, height: 90 });
    expect(next.notes[1]).toBe(prev.notes[1]);
    expect(next.nextZ).toBe(prev.nextZ);
  });

  it('returns the same state when the size does not change', () => {
    const id = asNoteId('a');
    const prev = withNotes(id);

    expect(
      boardReducer(prev, { type: 'note/resized', id, size: { width: 200, height: 150 } }),
    ).toBe(prev);
  });

  it('returns the same state for an unknown id', () => {
    const prev = withNotes(asNoteId('a'));

    expect(
      boardReducer(prev, {
        type: 'note/resized',
        id: asNoteId('missing'),
        size: { width: 300, height: 90 },
      }),
    ).toBe(prev);
  });

  it('deletes a note, keeping every other note by identity', () => {
    const prev = withNotes(asNoteId('a'), asNoteId('b'), asNoteId('c'));

    const next = boardReducer(prev, { type: 'note/deleted', id: asNoteId('b') });

    expect(next.notes).toHaveLength(2);
    expect(next.notes[0]).toBe(prev.notes[0]);
    expect(next.notes[1]).toBe(prev.notes[2]);
    expect(next.nextZ).toBe(prev.nextZ);
  });

  it('deleting an unknown id returns the same state', () => {
    const prev = withNotes(asNoteId('a'));

    expect(boardReducer(prev, { type: 'note/deleted', id: asNoteId('missing') })).toBe(prev);
  });
});
