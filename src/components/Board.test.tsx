// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import type { Point, Rect, Size } from '../domain/geometry.ts';
import { asNoteId, type NoteId } from '../domain/ids.ts';
import { Board } from './Board.tsx';
import { subscribeNoteRenders } from './renderProbe.ts';

// jsdom has no pointer capture; the board calls it on every primary-button press.
const setPointerCapture = vi.fn();

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  });
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

/** Ids 'new-1', 'new-2', … in creation order, so tests know which id a created note gets. */
function idSequence(): () => NoteId {
  let count = 0;
  return () => {
    count += 1;
    return asNoteId(`new-${String(count)}`);
  };
}

function Harness({ initial, variant = 'stable' }: HarnessProps) {
  const [state, dispatch] = useReducer(boardReducer, initial);
  const [createNoteId] = useState(() => idSequence());
  return (
    <Board
      createNoteId={createNoteId}
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

interface RenderOptions {
  readonly variant?: HarnessProps['variant'];
  /** Board size; jsdom does no layout, so the board reports this and every other element 0. */
  readonly size?: Size;
  /** Board's top-left in client coordinates. */
  readonly offset?: Point;
}

/** Renders the board and gives only the board element a size and a client position. */
function renderBoard(
  initial: BoardState,
  {
    variant,
    size = { width: 1024, height: 768 },
    offset = { x: 0, y: 0 },
  }: RenderOptions = {},
): void {
  render(<Harness initial={initial} variant={variant} />);
  const element = board();
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: size.width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: size.height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(offset.x, offset.y, size.width, size.height),
  });
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

function pixels(value: string): number {
  const match = /^(-?[\d.]+)px$/.exec(value);
  if (match === null) throw new Error(`unexpected length: "${value}"`);
  return Number(match[1]);
}

function rectOf(element: HTMLElement): Rect {
  return {
    ...positionOf(element),
    width: pixels(element.style.width),
    height: pixels(element.style.height),
  };
}

function preview(): HTMLElement | null {
  return screen.queryByTestId('creation-preview');
}

function previewRect(): Rect {
  const element = preview();
  if (element === null) throw new Error('no creation preview');
  return rectOf(element);
}

function notes(): HTMLElement[] {
  return screen.getAllByRole('article');
}

function handleOf(note: HTMLElement): HTMLElement {
  const handle = note.querySelector('[data-resize-handle]');
  if (!(handle instanceof HTMLElement)) throw new Error('note has no resize handle');
  return handle;
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
      renderBoard(boardWith(count));
      press(noteAt(0), 100, 100);

      const rendered = rendersDuring(() => {
        move(130, 150);
      });

      expect(rendered).toEqual(['0']);
      // The note really moved, so the count can't pass by nothing rendering.
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('pressing a note re-renders only that note (50 notes)', () => {
      renderBoard(boardWith(50));

      const rendered = rendersDuring(() => {
        press(noteAt(0), 100, 100);
      });

      // The bring-to-front render, nothing else.
      expect(rendered).toEqual(['0']);
    });

    it('an unstable dispatch does not reach the notes', () => {
      renderBoard(boardWith(50), { variant: 'inlineDispatch' });
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
      renderBoard(boardWith(50), { variant: 'clonedNotes' });
      press(noteAt(0), 100, 100);

      const rendered = rendersDuring(() => {
        move(130, 150);
      });

      expect(rendered).toHaveLength(50);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('creating a note re-renders no note while dragging, then only the new one (50 notes)', () => {
      renderBoard(boardWith(50));
      press(board(), 600, 600);
      move(605, 600);

      const whileDragging = rendersDuring(() => {
        move(700, 700);
      });

      expect(whileDragging).toEqual([]);
      // The preview really changed, so the empty list can't pass by the drag doing nothing.
      expect(previewRect()).toEqual({ x: 600, y: 600, width: 100, height: 100 });

      const onRelease = rendersDuring(() => {
        release();
      });

      expect(onRelease).toEqual(['new-1']);
    });

    it('resizing one note re-renders only that note (50 notes)', () => {
      renderBoard(boardWith(50));
      press(handleOf(noteAt(0)), 105, 105);

      const rendered = rendersDuring(() => {
        move(135, 125);
      });

      expect(rendered).toEqual(['0']);
      // The note really resized, so the count can't pass by nothing rendering.
      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 130, height: 120 });
    });
  });

  describe('dragging a note', () => {
    it('pressing a note brings it to the front', () => {
      renderBoard(boardWith(3));

      press(noteAt(0), 100, 100);

      // Three creations used z 1–3, so the next z is 4.
      expect(noteAt(0).style.zIndex).toBe('4');
    });

    it('positions the note from the press point, not by summing moves', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(130, 150);
      move(140, 160);

      expect(positionOf(noteAt(0))).toEqual({ x: 50, y: 70 });
    });

    it('keeps the note inside the board', () => {
      renderBoard(boardWith(1));

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
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100, { button: 2 });
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      expect(setPointerCapture).not.toHaveBeenCalled();
    });

    it('stops following the pointer after release', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(130, 150);
      // The drag was live before the release, so the final check can't pass by never moving.
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
      release();
      move(200, 200);

      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('keeps the note inside a smaller board', () => {
      renderBoard(boardWith(1), { size: { width: 600, height: 400 } });

      press(noteAt(0), 100, 100);
      move(5000, 5000);

      // 600 − 100 and 400 − 100: the board's own size.
      expect(positionOf(noteAt(0))).toEqual({ x: 500, y: 300 });
    });
  });

  describe('one gesture owner', () => {
    it('captures the pointer on the board', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100, { pointerId: 7 });

      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(setPointerCapture).toHaveBeenCalledWith(7);
      expect(setPointerCapture.mock.contexts[0]).toBe(board());
    });

    it('ignores a second pointer while a drag is active', () => {
      renderBoard(boardWith(2));

      press(noteAt(0), 100, 100, { pointerId: 1 });
      press(noteAt(1), 100, 100, { pointerId: 2 });

      // Not brought to front: note 1 keeps the z it was created with.
      expect(noteAt(1).style.zIndex).toBe('2');
      move(130, 150);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('ignores moves from another pointer', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100, { pointerId: 1 });
      move(300, 300, 2);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
    });

    it.each(['pointerUp', 'pointerCancel'] as const)(
      "another pointer's %s does not end the drag",
      (eventName) => {
        renderBoard(boardWith(1));

        press(noteAt(0), 100, 100, { pointerId: 1 });
        // Ignored: a gesture is already active.
        press(board(), 500, 500, { pointerId: 2 });
        fireEvent[eventName](board(), { pointerId: 2 });
        move(130, 150);

        expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
      },
    );

    it.each(['pointerCancel', 'lostPointerCapture'] as const)('%s ends the drag', (eventName) => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      fireEvent[eventName](board(), { pointerId: 1 });
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
    });

    it('a second drag starts where the first ended', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(130, 150);
      release();
      press(noteAt(0), 200, 200);
      move(210, 210);

      expect(positionOf(noteAt(0))).toEqual({ x: 50, y: 70 });
    });
  });

  describe('creating a note', () => {
    it('a click on the empty board creates a default-size note at the click point', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      expect(preview()).toBeNull();
      release();

      expect(notes()).toHaveLength(2);
      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 200, height: 150 });
      expect(noteAt(1).style.zIndex).toBe('2');
      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(setPointerCapture.mock.contexts[0]).toBe(board());
      expect(preview()).toBeNull();
    });

    it('a click near the edge creates the note inside the board', () => {
      renderBoard(boardWith(1));

      press(board(), 950, 700);
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 824, y: 618, width: 200, height: 150 });
    });

    it('a press that moves 4px or less is still a click', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      move(304, 196);
      expect(preview()).toBeNull();
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 200, height: 150 });
    });

    it('dragging past 4px creates the dragged rectangle', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      // Past the slop on y only.
      move(300, 205);
      expect(preview()).not.toBeNull();
      move(500, 400);
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 200, height: 200 });
      expect(preview()).toBeNull();
    });

    it('dragging up and left creates the normalized rectangle', () => {
      renderBoard(boardWith(1));

      press(board(), 500, 400);
      move(300, 250);
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 250, width: 200, height: 150 });
    });

    it('a drag that comes back near the press point creates a minimum-size note', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      move(500, 400);
      move(302, 201);
      release();

      // Still a drag once it left the slop, so the rect grows to the minimum: no click note.
      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 80, height: 60 });
    });

    it('the dragged rectangle stays inside the board', () => {
      renderBoard(boardWith(1));

      press(board(), 900, 700);
      move(5000, 5000);
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 900, y: 700, width: 124, height: 68 });
    });

    it('the preview shows the rectangle that will be created', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      move(500, 400);
      expect(previewRect()).toEqual({ x: 300, y: 200, width: 200, height: 200 });
      move(310, 210);
      expect(previewRect()).toEqual({ x: 300, y: 200, width: 80, height: 60 });
    });

    it.each(['pointerCancel', 'lostPointerCapture'] as const)(
      '%s while creating creates nothing',
      (eventName) => {
        renderBoard(boardWith(1));

        press(board(), 300, 200);
        move(500, 400);
        fireEvent[eventName](board(), { pointerId: 1 });

        expect(notes()).toHaveLength(1);
        expect(preview()).toBeNull();

        press(board(), 600, 500);
        release();

        // The aborted create consumed no id.
        expect(noteAt(1).dataset.noteId).toBe('new-1');
      },
    );

    it('creating uses board coordinates', () => {
      renderBoard(boardWith(1), { offset: { x: 20, y: 30 } });

      press(board(), 320, 230);
      move(520, 430);
      release();
      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 200, height: 200 });

      // The click path converts too.
      press(board(), 340, 250);
      release();
      expect(rectOf(noteAt(2))).toEqual({ x: 320, y: 220, width: 200, height: 150 });
    });

    it("a created note is clamped to the board's real size", () => {
      renderBoard(boardWith(1), { size: { width: 600, height: 400 } });

      press(board(), 500, 350);
      release();

      expect(rectOf(noteAt(1))).toEqual({ x: 400, y: 250, width: 200, height: 150 });
    });

    it('ignores a non-primary press on the empty board', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200, { button: 2 });
      release();

      expect(notes()).toHaveLength(1);
    });

    it('ignores moves from another pointer while creating', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200, { pointerId: 1 });
      move(500, 400, 2);
      expect(preview()).toBeNull();
      release(1);

      expect(rectOf(noteAt(1))).toEqual({ x: 300, y: 200, width: 200, height: 150 });
    });

    it('a created note can be dragged right away', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      release();
      press(noteAt(1), 310, 210);
      move(330, 230);

      expect(positionOf(noteAt(1))).toEqual({ x: 320, y: 220 });
    });
  });

  describe('resizing a note', () => {
    it('dragging the handle resizes the note from the press point, keeping its top-left', () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105);
      move(135, 125);
      move(145, 135);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 140, height: 130 });
      // A handle press neither moves the note nor creates one.
      expect(notes()).toHaveLength(1);
    });

    it('pressing the handle brings the note to the front and captures on the board', () => {
      renderBoard(boardWith(3));

      press(handleOf(noteAt(0)), 105, 105, { pointerId: 7 });

      expect(noteAt(0).style.zIndex).toBe('4');
      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(setPointerCapture).toHaveBeenCalledWith(7);
      expect(setPointerCapture.mock.contexts[0]).toBe(board());
    });

    it('resizing keeps the minimum size', () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105);
      move(0, 0);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 80, height: 60 });
    });

    it("resizing stops at the board's edges", () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105);
      move(5000, 5000);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 1014, height: 758 });
    });

    it("resizing is clamped to the board's real size", () => {
      renderBoard(boardWith(1), { size: { width: 600, height: 400 } });

      press(handleOf(noteAt(0)), 105, 105);
      move(5000, 5000);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 590, height: 390 });
    });

    it('ignores moves from another pointer while resizing', () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105, { pointerId: 1 });
      move(135, 125, 2);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 100, height: 100 });
    });

    it("a descendant's lost capture does not end the gesture", () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      fireEvent.lostPointerCapture(handleOf(noteAt(0)), { pointerId: 1 });
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });
  });
});
