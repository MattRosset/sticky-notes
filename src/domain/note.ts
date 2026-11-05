import type { Rect, Size } from './geometry.ts';
import type { NoteId } from './ids.ts';

export interface Note {
  readonly id: NoteId;
  readonly rect: Rect;
  /** Stacking order. Higher is in front. Assigned from BoardState.nextZ, never reused. */
  readonly z: number;
  readonly text: string;
}

/** Smallest note a user can create or resize to. */
export const MIN_NOTE_SIZE: Size = { width: 80, height: 60 };
/** Size of a note created by a click instead of a drag. */
export const DEFAULT_NOTE_SIZE: Size = { width: 200, height: 150 };
