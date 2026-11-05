import type { Rect } from './geometry.ts';
import type { NoteId } from './ids.ts';

export interface Note {
  readonly id: NoteId;
  readonly rect: Rect;
  /** Stacking order. Higher is in front. Assigned from BoardState.nextZ, never reused. */
  readonly z: number;
  readonly text: string;
}
