import { useRef, type Dispatch, type PointerEvent } from 'react';
import type { BoardAction } from '../domain/board.ts';
import { movedPosition, type Point, type Rect, type Size } from '../domain/geometry.ts';
import type { NoteId } from '../domain/ids.ts';
import type { Note } from '../domain/note.ts';

type Gesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'moving';
      readonly pointerId: number;
      /** Pointer position at press, in client coordinates. */
      readonly origin: Point;
      readonly noteId: NoteId;
      /** The note's rect at press time; every move is computed from it, never accumulated. */
      readonly startRect: Rect;
      /** Board size at press time. */
      readonly bounds: Size;
    };

/** Spread onto the board element. */
export interface BoardGestureHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
}

/** Spread onto a note's element so a press on it is classified as a press on that note. */
export function noteTargetProps(id: NoteId): { readonly 'data-note-id': NoteId } {
  return { 'data-note-id': id };
}

/** The note under a press, or undefined for the empty board (or an id no longer in `notes`). */
function pressedNote(target: EventTarget, notes: readonly Note[]): Note | undefined {
  if (!(target instanceof Element)) return undefined;
  const raw = target.closest('[data-note-id]')?.getAttribute('data-note-id');
  return notes.find((note) => note.id === raw);
}

/**
 * Owns the single pointer gesture of the whole board: classifies each primary-button press (a
 * note or the empty board) and turns press-drag-release on a note into board actions.
 *
 * The pointer is captured on the board element, not on the pressed note:
 * - one element receives every event of the gesture, the same element whose handlers own it, so
 *   nothing depends on events bubbling up from a note;
 * - a gesture may outlive or precede its note (a note can be deleted on drop, or created by a
 *   gesture that starts where no note exists yet). When a captured node is removed, the browser
 *   sends `lostpointercapture` to the document, not to that node, so a gesture captured on a note
 *   could never learn that its capture ended. The board is never removed.
 *
 * The gesture lives in a ref, so pressing and moving don't render by themselves; only what the
 * hook dispatches does.
 */
export function useBoardGesture(
  notes: readonly Note[],
  dispatch: Dispatch<BoardAction>,
): BoardGestureHandlers {
  const gesture = useRef<Gesture>({ kind: 'idle' });

  /**
   * The only way a gesture ends, shared by pointerup, pointercancel and lostpointercapture:
   * - another pointer's up or cancel never ends this gesture, because the pointerId must match;
   * - lostpointercapture after pointerup is a no-op, because pointerup already went idle, so an
   *   end never happens twice;
   * - pointerup is the normal completion; pointercancel or lostpointercapture without a preceding
   *   pointerup is an abort.
   */
  const endGesture = (event: PointerEvent<HTMLElement>): void => {
    const current = gesture.current;
    if (current.kind === 'idle' || event.pointerId !== current.pointerId) return;
    gesture.current = { kind: 'idle' };
  };

  // Re-created on every render on purpose: they sit on the board, not on a memoized child, and
  // each render's handlers must see the latest `notes` so a second drag starts where the first ended.
  return {
    onPointerDown: (event) => {
      // One gesture at a time: a second pointer (another finger, a pen) is ignored while one is
      // active.
      if (event.button !== 0 || gesture.current.kind !== 'idle') return;
      const note = pressedNote(event.target, notes);
      if (note === undefined) return;
      const board = event.currentTarget;
      // Capture before writing the gesture: if setPointerCapture throws (NotFoundError for an
      // inactive pointer), the gesture stays idle instead of stuck.
      board.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'moving',
        pointerId: event.pointerId,
        // Client coordinates equal board coordinates only because the board is
        // `position: fixed; inset: 0` (see Board.module.css). Moving only uses deltas, which are
        // the same in both systems. A gesture that needs an absolute board position (creating a
        // note at the press point) converts here, by subtracting the board's
        // getBoundingClientRect() left/top, not in the components or the domain.
        origin: { x: event.clientX, y: event.clientY },
        noteId: note.id,
        startRect: note.rect,
        bounds: { width: board.clientWidth, height: board.clientHeight },
      };
      dispatch({ type: 'note/broughtToFront', id: note.id });
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (current.kind !== 'moving' || event.pointerId !== current.pointerId) return;
      const delta = { x: event.clientX - current.origin.x, y: event.clientY - current.origin.y };
      dispatch({
        type: 'note/moved',
        id: current.noteId,
        position: movedPosition(current.startRect, delta, current.bounds),
      });
    },
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
    onLostPointerCapture: endGesture,
  };
}
