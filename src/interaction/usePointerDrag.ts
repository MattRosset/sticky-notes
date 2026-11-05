import { useRef, type PointerEvent } from 'react';
import type { Point } from '../domain/geometry.ts';

/** What a drag captures when it starts (e.g. the note's rect and the board size). */
interface PointerDragOptions<TStart> {
  /** Called once on a primary-button press; its result is handed to every onMove. */
  readonly onStart: () => TStart;
  /** Called on every pointermove of the captured pointer, with the offset from the press point. */
  readonly onMove: (start: TStart, delta: Point) => void;
}

/** Spread onto the element that is dragged. */
export interface PointerDragHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerCancel: () => void;
  readonly onLostPointerCapture: () => void;
}

type Gesture<TStart> =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly pointerId: number;
      readonly origin: Point;
      readonly start: TStart;
    };

/**
 * Turns one primary-button press-drag-release on an element into `onStart` / `onMove` calls.
 *
 * The pointer is captured on press, so move and up keep reaching this element even when the
 * cursor outruns it. The gesture lives in a ref, so pressing and moving don't render by
 * themselves; only what `onStart` and `onMove` dispatch does.
 */
export function usePointerDrag<TStart>(options: PointerDragOptions<TStart>): PointerDragHandlers {
  const gesture = useRef<Gesture<TStart>>({ kind: 'idle' });

  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || gesture.current.kind !== 'idle') return;
      // Capture before onStart: onStart may dispatch, and the captured node must not move in the
      // DOM afterwards. Stacking is a z-index change, so bringing a note to front doesn't move it.
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        kind: 'dragging',
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        start: options.onStart(),
      };
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (current.kind !== 'dragging' || event.pointerId !== current.pointerId) return;
      // Always the offset from the press point, never from the previous move, so a position the
      // caller clamps can't drift away from the pointer.
      options.onMove(current.start, {
        x: event.clientX - current.origin.x,
        y: event.clientY - current.origin.y,
      });
    },
    onPointerUp: () => {
      gesture.current = { kind: 'idle' };
    },
    onPointerCancel: () => {
      gesture.current = { kind: 'idle' };
    },
    // The browser can release capture on its own, without a pointerup or pointercancel here.
    onLostPointerCapture: () => {
      gesture.current = { kind: 'idle' };
    },
  };
}
