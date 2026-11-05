import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import type { Rect } from '../domain/geometry.ts';
import { newNoteId } from './newNoteId.ts';

const seedRects: readonly Rect[] = [
  { x: 40, y: 60, width: 200, height: 160 },
  { x: 280, y: 60, width: 200, height: 160 },
  { x: 520, y: 60, width: 200, height: 160 },
];

/** Until the board shows a hint when empty, it starts with three notes to drag. */
export function createSeedState(): BoardState {
  return seedRects.reduce(
    (state, rect) => boardReducer(state, { type: 'note/created', id: newNoteId(), rect }),
    initialBoardState,
  );
}
