// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import type { Point } from '../domain/geometry.ts';
import { asNoteId } from '../domain/ids.ts';
import { Board } from './Board.tsx';
import { subscribeNoteRenders } from './renderProbe.ts';

// jsdom has no pointer capture; the board calls it on every press on a note.
const setPointerCapture = vi.fn();

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  });
  // jsdom does no layout, and the clamp needs a board size.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(768);
});

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
  vi.restoreAllMocks();
});

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  setPointerCapture.mockClear();
});

interface HarnessProps {
  readonly initial: BoardState;
  /**
   * 'inlineDispatch' passes a new wrapper around dispatch on every render; 'clonedNotes' passes
   * every note as a new object on every render, which defeats the notes' memo.
   */
  readonly variant?: 'stable' | 'inlineDispatch' | 'clonedNotes';
}

function Harness({ initial, variant = 'stable' }: HarnessProps) {
  const [state, dispatch] = useReducer(boardReducer, initial);
  return (
    <Board
      notes={variant === 'clonedNotes' ? state.notes.map((note) => ({ ...note })) : state.notes}
      dispatch={
        variant === 'inlineDispatch'
          ? (action) => {
              dispatch(action);
            }
          : dispatch
      }
    />
  );
}

/** A board with notes '0'…'count-1', all at the same rect. */
function boardWith(count: number): BoardState {
  return Array.from({ length: count }, (_, index) => asNoteId(String(index))).reduce(
    (state, id) =>
      boardReducer(state, {
        type: 'note/created',
        id,
        rect: { x: 10, y: 10, width: 100, height: 100 },
      }),
    initialBoardState,
  );
}

/** Notes are created in id order, so note `index` is the article at that index in the DOM. */
function noteAt(index: number): HTMLElement {
  const note = screen.getAllByRole('article')[index];
  if (note === undefined) throw new Error(`no note at index ${String(index)}`);
  return note;
}

function board(): HTMLElement {
  return screen.getByRole('main');
}

function positionOf(note: HTMLElement): Point {
  const transform = note.style.transform;
  const match = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(transform);
  if (match === null) throw new Error(`unexpected transform: "${transform}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Presses fire on the pressed element: a note, or the board itself for the empty board. */
function press(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  { pointerId = 1, button = 0 }: { readonly pointerId?: number; readonly button?: number } = {},
): void {
  fireEvent.pointerDown(element, { button, pointerId, clientX, clientY });
}

// Moves and releases fire on the board: with the pointer captured there, that is where the
// browser targets them.
function move(clientX: number, clientY: number, pointerId = 1): void {
  fireEvent.pointerMove(board(), { pointerId, clientX, clientY });
}

function release(pointerId = 1): void {
  fireEvent.pointerUp(board(), { pointerId });
}

/** Ids of the notes that render while `action` runs. */
function rendersDuring(action: () => void): string[] {
  const rendered: string[] = [];
  const unsubscribe = subscribeNoteRenders((id) => {
    rendered.push(id);
  });
  try {
    action();
  } finally {
    unsubscribe();
  }
  return rendered;
}

describe('Board', () => {
  describe('render gate', () => {
    it.each([1, 50])('moving one note re-renders only that note (%i notes)', (count) => {
      render(<Harness initial={boardWith(count)} />);
      press(noteAt(0), 100, 100);

      const rendered = rendersDuring(() => {
        move(130, 150);
      });

      expect(rendered).toEqual(['0']);
      // The note really moved, so the count can't pass by nothing rendering.
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('pressing a note re-renders only that note (50 notes)', () => {
      render(<Harness initial={boardWith(50)} />);

      const rendered = rendersDuring(() => {
        press(noteAt(0), 100, 100);
      });

      // The bring-to-front render, nothing else.
      expect(rendered).toEqual(['0']);
    });

    it('an unstable dispatch does not reach the notes', () => {
      render(<Harness initial={boardWith(50)} variant="inlineDispatch" />);
      press(noteAt(0), 100, 100);

      const rendered = rendersDuring(() => {
        move(130, 150);
      });

      expect(rendered).toEqual(['0']);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('the render probe sees notes that were not moved', () => {
      // The probe's own control: a probe that only reported the dispatched note would pass the
      // tests above and fail this one.
      render(<Harness initial={boardWith(50)} variant="clonedNotes" />);
      press(noteAt(0), 100, 100);

      const rendered = rendersDuring(() => {
        move(130, 150);
      });

      expect(rendered).toHaveLength(50);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });
  });

  describe('dragging a note', () => {
    it('pressing a note brings it to the front', () => {
      render(<Harness initial={boardWith(3)} />);

      press(noteAt(0), 100, 100);

      // Three creations used z 1–3, so the next z is 4.
      expect(noteAt(0).style.zIndex).toBe('4');
    });

    it('positions the note from the press point, not by summing moves', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100);
      move(130, 150);
      move(140, 160);

      expect(positionOf(noteAt(0))).toEqual({ x: 50, y: 70 });
    });

    it('keeps the note inside the board', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100);
      move(5000, -5000);
      // 1024 − 100 on x, 0 on y.
      expect(positionOf(noteAt(0))).toEqual({ x: 924, y: 0 });

      // The position comes from the press point, so leaving the clamped zone tracks the pointer
      // immediately instead of walking back from the edge.
      move(130, 150);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('ignores presses with a non-primary button', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100, { button: 2 });
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      expect(setPointerCapture).not.toHaveBeenCalled();
    });

    it('stops following the pointer after release', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100);
      move(130, 150);
      // The drag was live before the release, so the final check can't pass by never moving.
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
      release();
      move(200, 200);

      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });
  });

  describe('one gesture owner', () => {
    it('captures the pointer on the board', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100, { pointerId: 7 });

      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(setPointerCapture).toHaveBeenCalledWith(7);
      expect(setPointerCapture.mock.contexts[0]).toBe(board());
    });

    it('ignores a second pointer while a drag is active', () => {
      render(<Harness initial={boardWith(2)} />);

      press(noteAt(0), 100, 100, { pointerId: 1 });
      press(noteAt(1), 100, 100, { pointerId: 2 });

      // Not brought to front: note 1 keeps the z it was created with.
      expect(noteAt(1).style.zIndex).toBe('2');
      move(130, 150);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('ignores moves from another pointer', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100, { pointerId: 1 });
      move(300, 300, 2);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
    });

    it.each(['pointerUp', 'pointerCancel'] as const)(
      "another pointer's %s does not end the drag",
      (eventName) => {
        render(<Harness initial={boardWith(1)} />);

        press(noteAt(0), 100, 100, { pointerId: 1 });
        // Ignored: a gesture is already active.
        press(board(), 500, 500, { pointerId: 2 });
        fireEvent[eventName](board(), { pointerId: 2 });
        move(130, 150);

        expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
      },
    );

    it.each(['pointerCancel', 'lostPointerCapture'] as const)('%s ends the drag', (eventName) => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100);
      fireEvent[eventName](board(), { pointerId: 1 });
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
    });

    it('a press on the empty board does nothing yet', () => {
      render(<Harness initial={boardWith(1)} />);

      press(board(), 500, 500);
      move(600, 600);

      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      expect(noteAt(0).style.zIndex).toBe('1');
    });

    it('a second drag starts where the first ended', () => {
      render(<Harness initial={boardWith(1)} />);

      press(noteAt(0), 100, 100);
      move(130, 150);
      release();
      press(noteAt(0), 200, 200);
      move(210, 210);

      expect(positionOf(noteAt(0))).toEqual({ x: 50, y: 70 });
    });
  });
});
