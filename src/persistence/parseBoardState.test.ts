import { describe, expect, it } from 'vitest';
import { parseBoardState } from './parseBoardState.ts';

// Stored data as a test can edit it: every field writable and of any type.
interface RawRect {
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
}

interface RawNote {
  id: unknown;
  rect: RawRect;
  z: unknown;
  text: unknown;
}

interface RawBoard {
  notes: (RawNote | null)[];
  nextZ: unknown;
}

/** A fresh copy of a board this app could have saved. */
function valid(): RawBoard {
  const noteA: RawNote = {
    id: 'a',
    rect: { x: 10, y: 20, width: 200, height: 150 },
    z: 1,
    text: 'Buy milk',
  };
  // A negative x and exactly the minimum size are valid.
  const noteB: RawNote = { id: 'b', rect: { x: -5, y: 0, width: 80, height: 60 }, z: 2, text: '' };
  return { notes: [noteA, noteB], nextZ: 3 };
}

function noteOf(board: RawBoard, index: number): RawNote {
  const note = board.notes[index];
  if (note === undefined || note === null) throw new Error(`no note at index ${String(index)}`);
  return note;
}

/** A row's mutation: edits the fresh board in place and returns it. */
function edit(change: (board: RawBoard) => void): (board: RawBoard) => unknown {
  return (board) => {
    change(board);
    return board;
  };
}

const invalid: [string, (board: RawBoard) => unknown][] = [
  ['null', () => null],
  ['a number', () => 42],
  ['an array', () => []],
  [
    'missing notes',
    edit((board) => {
      Reflect.deleteProperty(board, 'notes');
    }),
  ],
  ['notes not an array', (board) => ({ ...board, notes: {} })],
  [
    'missing nextZ',
    edit((board) => {
      Reflect.deleteProperty(board, 'nextZ');
    }),
  ],
  [
    'nextZ 0',
    edit((board) => {
      board.nextZ = 0;
    }),
  ],
  [
    'nextZ 1.5',
    edit((board) => {
      board.nextZ = 1.5;
    }),
  ],
  [
    'nextZ a string',
    edit((board) => {
      board.nextZ = '3';
    }),
  ],
  [
    'a note that is null',
    edit((board) => {
      board.notes[0] = null;
    }),
  ],
  [
    'a note without id',
    edit((board) => {
      Reflect.deleteProperty(noteOf(board, 0), 'id');
    }),
  ],
  [
    'an id that is a number',
    edit((board) => {
      noteOf(board, 0).id = 1;
    }),
  ],
  [
    'an empty id',
    edit((board) => {
      noteOf(board, 0).id = '';
    }),
  ],
  [
    'a note without rect',
    edit((board) => {
      Reflect.deleteProperty(noteOf(board, 0), 'rect');
    }),
  ],
  [
    'rect x a string',
    edit((board) => {
      noteOf(board, 0).rect.x = '10';
    }),
  ],
  [
    'rect y null',
    edit((board) => {
      noteOf(board, 0).rect.y = null;
    }),
  ],
  [
    'rect width Infinity',
    edit((board) => {
      noteOf(board, 0).rect.width = Infinity;
    }),
  ],
  [
    'width below the minimum',
    edit((board) => {
      noteOf(board, 0).rect.width = 79;
    }),
  ],
  [
    'height below the minimum',
    edit((board) => {
      noteOf(board, 0).rect.height = 59;
    }),
  ],
  [
    'a note without z',
    edit((board) => {
      Reflect.deleteProperty(noteOf(board, 0), 'z');
    }),
  ],
  [
    'z 0',
    edit((board) => {
      noteOf(board, 0).z = 0;
    }),
  ],
  [
    'z 1.5',
    edit((board) => {
      noteOf(board, 0).z = 1.5;
    }),
  ],
  [
    'z equal to nextZ',
    edit((board) => {
      noteOf(board, 1).z = 3;
    }),
  ],
  [
    'text a number',
    edit((board) => {
      noteOf(board, 0).text = 1;
    }),
  ],
  [
    'a note without text',
    edit((board) => {
      Reflect.deleteProperty(noteOf(board, 0), 'text');
    }),
  ],
  [
    'duplicate ids',
    edit((board) => {
      noteOf(board, 1).id = 'a';
    }),
  ],
];

describe('parseBoardState', () => {
  it('a board this app saved parses to the same board', () => {
    expect(parseBoardState(valid())).toEqual(valid());
  });

  it('an empty board parses', () => {
    expect(parseBoardState({ notes: [], nextZ: 1 })).toEqual({ notes: [], nextZ: 1 });
  });

  it('extra fields are dropped', () => {
    const board = valid();
    const first = noteOf(board, 0);
    const withExtras = {
      ...board,
      extra: 1,
      notes: [{ ...first, extra: 1, rect: { ...first.rect, extra: 1 } }, noteOf(board, 1)],
    };

    expect(parseBoardState(withExtras)).toStrictEqual(valid());
  });

  it.each(invalid)('rejects %s', (_name, mutate) => {
    expect(parseBoardState(mutate(valid()))).toBeNull();
  });
});
