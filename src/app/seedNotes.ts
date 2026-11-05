import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import type { Rect } from '../domain/geometry.ts';
import { asNoteId } from '../domain/ids.ts';

const seedRects: readonly Rect[] = [
  { x: 40, y: 60, width: 200, height: 160 },
  { x: 280, y: 60, width: 200, height: 160 },
  { x: 520, y: 60, width: 200, height: 160 },
];

/** Three notes to drag. Temporary until notes can be created on the board. */
export function createSeedState(): BoardState {
  return seedRects.reduce(
    (state, rect) =>
      boardReducer(state, { type: 'note/created', id: asNoteId(crypto.randomUUID()), rect }),
    initialBoardState,
  );
}
