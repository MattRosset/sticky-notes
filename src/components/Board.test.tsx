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
  /** The trash's client rect; defaults to 96×96, 24px in from the board's bottom-right corner. */
  readonly trashRect?: Rect;
}

/** Renders the board and gives the board and the trash a size and a client position. */
function renderBoard(
  initial: BoardState,
  {
    variant,
    size = { width: 1024, height: 768 },
    offset = { x: 0, y: 0 },
    trashRect = {
      x: offset.x + size.width - 120,
      y: offset.y + size.height - 120,
      width: 96,
      height: 96,
    },
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
  Object.defineProperty(trash(), 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(trashRect.x, trashRect.y, trashRect.width, trashRect.height),
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

function trash(): HTMLElement {
  return screen.getByRole('img', { name: 'Trash' });
}

function trashState(): string | undefined {
  return trash().dataset.state;
}

function gestureOf(): string | undefined {
  return board().dataset.gesture;
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

function hint(): HTMLElement | null {
  return screen.queryByText('Click anywhere to add a note, or drag to draw one.');
}

function previewRect(): Rect {
  const element = preview();
  if (element === null) throw new Error('no creation preview');
  return rectOf(element);
}

function notes(): HTMLElement[] {
  return screen.queryAllByRole('article');
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

// Keys go to the focused element; nothing on the board takes focus, so that is the body.
function pressKey(key: string): void {
  fireEvent.keyDown(document.body, { key });
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

    it('trash feedback re-renders no note (50 notes)', () => {
      renderBoard(boardWith(50));
      press(noteAt(0), 15, 15);
      // The note is pinned at the corner, (924, 668), so only the trash changes below.
      move(5000, 5000);

      const entering = rendersDuring(() => {
        move(950, 700);
      });

      expect(entering).toEqual([]);
      expect(trashState()).toBe('armed');

      const leaving = rendersDuring(() => {
        move(5000, 5000);
      });

      expect(leaving).toEqual([]);
      expect(trashState()).toBe('active');
    });

    it('deleting a note re-renders no other note (50 notes)', () => {
      renderBoard(boardWith(50));
      press(noteAt(0), 100, 100);
      move(950, 700);

      const rendered = rendersDuring(() => {
        release();
      });

      expect(rendered).toEqual([]);
      // The note really went, so the empty list can't pass by the release doing nothing.
      expect(notes()).toHaveLength(49);
    });

    it('Escape re-renders only the reverted note (50 notes)', () => {
      renderBoard(boardWith(50));
      press(noteAt(0), 100, 100);
      move(130, 150);

      const rendered = rendersDuring(() => {
        pressKey('Escape');
      });

      expect(rendered).toEqual(['0']);
      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
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

    it('the board reports the gesture in progress', () => {
      renderBoard(boardWith(1));
      expect(gestureOf()).toBe('idle');

      press(noteAt(0), 100, 100);
      expect(gestureOf()).toBe('moving');
      release();
      expect(gestureOf()).toBe('idle');

      press(handleOf(noteAt(0)), 105, 105);
      expect(gestureOf()).toBe('resizing');
      release();
      expect(gestureOf()).toBe('idle');

      press(board(), 300, 200);
      expect(gestureOf()).toBe('creating');
      fireEvent.pointerCancel(board(), { pointerId: 1 });
      expect(gestureOf()).toBe('idle');
    });

    it('notes are drawn in their own layer, below the preview and the trash', () => {
      renderBoard(boardWith(1));
      press(board(), 300, 200);
      move(500, 400);

      // CSS isn't applied in jsdom, so this checks the structure the stacking relies on; the
      // stacking itself is checked in a browser.
      const layer = noteAt(0).parentElement;
      const drawn = preview();
      if (layer === null) throw new Error('the note has no parent');
      if (drawn === null) throw new Error('no creation preview');
      expect(layer).not.toBe(board());
      expect(layer.parentElement).toBe(board());
      for (const element of [drawn, trash()]) {
        expect(layer.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
          0,
        );
      }
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

  describe('trash', () => {
    it('the trash is at rest unless a note is moving', () => {
      renderBoard(boardWith(1));
      expect(trashState()).toBe('rest');

      press(handleOf(noteAt(0)), 105, 105);
      expect(trashState()).toBe('rest');
      release();

      press(board(), 300, 200);
      expect(trashState()).toBe('rest');
      release();

      press(noteAt(0), 50, 50);
      expect(trashState()).toBe('active');
    });

    it('the trash arms while the pointer is over it', () => {
      renderBoard(boardWith(1));
      press(noteAt(0), 100, 100);

      move(950, 700);
      expect(trashState()).toBe('armed');
      move(850, 700);
      expect(trashState()).toBe('active');
      move(950, 600);
      expect(trashState()).toBe('active');
      move(904, 648);
      expect(trashState()).toBe('armed');
      move(1000, 700);
      expect(trashState()).toBe('active');
    });

    it('releasing over the trash deletes the note and keeps the others', () => {
      renderBoard(boardWith(3));

      press(noteAt(1), 100, 100);
      move(950, 700);
      release();

      expect(notes().map((note) => note.dataset.noteId)).toEqual(['0', '2']);
      expect(trashState()).toBe('rest');
      expect(gestureOf()).toBe('idle');
    });

    it('releasing away from the trash keeps the note', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(950, 700);
      move(500, 400);
      release();

      expect(notes()).toHaveLength(1);
      expect(positionOf(noteAt(0))).toEqual({ x: 410, y: 310 });
    });

    it('only the pointer counts, not the note overlapping the trash', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 15, 15);
      move(880, 640);
      // The note now overlaps the trash; the pointer does not.
      expect(positionOf(noteAt(0))).toEqual({ x: 875, y: 635 });
      expect(trashState()).toBe('active');
      release();

      expect(notes()).toHaveLength(1);
    });

    it.each(['pointerCancel', 'lostPointerCapture'] as const)(
      '%s over the trash deletes nothing',
      (eventName) => {
        renderBoard(boardWith(1));

        press(noteAt(0), 100, 100);
        move(950, 700);
        fireEvent[eventName](board(), { pointerId: 1 });

        expect(notes()).toHaveLength(1);
        // An aborted move stays where it was.
        expect(positionOf(noteAt(0))).toEqual({ x: 860, y: 610 });
        expect(trashState()).toBe('rest');
      },
    );

    it('resizing over the trash deletes nothing', () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105);
      move(950, 700);
      expect(trashState()).toBe('rest');
      release();

      expect(notes()).toHaveLength(1);
    });

    it('a press on the trash starts nothing', () => {
      renderBoard(boardWith(1));

      press(trash(), 950, 700);
      release();

      expect(notes()).toHaveLength(1);
      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(gestureOf()).toBe('idle');
    });

    it('a press on the trash icon starts nothing', () => {
      renderBoard(boardWith(1));
      // A real click lands on the icon's <path>, not on the trash <div>.
      const icon = trash().querySelector('path');
      if (icon === null) throw new Error('the trash has no icon');

      fireEvent.pointerDown(icon, { button: 0, pointerId: 1, clientX: 950, clientY: 700 });
      release();

      expect(notes()).toHaveLength(1);
      expect(setPointerCapture).not.toHaveBeenCalled();
    });

    it('the trash is hit-tested where it is drawn', () => {
      renderBoard(boardWith(1), {
        offset: { x: 20, y: 30 },
        trashRect: { x: 120, y: 530, width: 96, height: 96 },
      });

      press(noteAt(0), 100, 100);
      // (130, 540) catches an unconverted trash rect, (210, 620) an unconverted pointer.
      move(130, 540);
      expect(trashState()).toBe('armed');
      move(210, 620);
      expect(trashState()).toBe('armed');
      move(500, 300);
      expect(trashState()).toBe('active');
      move(130, 540);
      release();

      expect(notes()).toHaveLength(0);
    });

    it('the trash is read at each press', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(950, 700);
      expect(trashState()).toBe('armed');
      move(500, 400);
      // The note is now at (410, 310).
      release();

      Object.defineProperty(trash(), 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(100, 100, 96, 96),
      });
      press(noteAt(0), 450, 350);
      move(150, 150);

      expect(trashState()).toBe('armed');
    });
  });

  describe('Escape', () => {
    it('Escape while moving puts the note back and ends the drag', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(130, 150);
      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
      pressKey('Escape');
      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      expect(gestureOf()).toBe('idle');
      move(200, 200);
      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      release();

      expect(notes()).toHaveLength(1);
    });

    it('Escape over the trash deletes nothing', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(950, 700);
      expect(trashState()).toBe('armed');
      pressKey('Escape');
      expect(trashState()).toBe('rest');
      expect(positionOf(noteAt(0))).toEqual({ x: 10, y: 10 });
      release();

      expect(notes()).toHaveLength(1);
    });

    it('Escape while resizing restores the size', () => {
      renderBoard(boardWith(1));

      press(handleOf(noteAt(0)), 105, 105);
      move(135, 125);
      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 130, height: 120 });
      pressKey('Escape');
      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 100, height: 100 });
      move(200, 200);

      expect(rectOf(noteAt(0))).toEqual({ x: 10, y: 10, width: 100, height: 100 });
    });

    it('Escape while drawing a note discards it', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      move(500, 400);
      expect(preview()).not.toBeNull();
      pressKey('Escape');
      expect(preview()).toBeNull();
      expect(gestureOf()).toBe('idle');
      release();

      expect(notes()).toHaveLength(1);
    });

    it('Escape during a click on the empty board creates nothing', () => {
      renderBoard(boardWith(1));

      press(board(), 300, 200);
      pressKey('Escape');
      release();

      expect(notes()).toHaveLength(1);
    });

    it('other keys do not end the gesture', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      pressKey('Enter');
      move(130, 150);

      expect(positionOf(noteAt(0))).toEqual({ x: 40, y: 60 });
    });

    it('a drag after Escape works normally', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(130, 150);
      pressKey('Escape');
      release();
      press(noteAt(0), 100, 100);
      move(110, 110);

      expect(positionOf(noteAt(0))).toEqual({ x: 20, y: 20 });
    });

    it('listens for keys once, on the window, until unmounted', () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      try {
        renderBoard(boardWith(1));
        press(noteAt(0), 100, 100);
        move(130, 150);
        move(140, 160);
        release();

        const added = add.mock.calls
          .filter((call) => call[0] === 'keydown')
          .map((call) => call[1]);
        expect(added).toHaveLength(1);

        cleanup();

        const removed = remove.mock.calls
          .filter((call) => call[0] === 'keydown')
          .map((call) => call[1]);
        expect(removed).toEqual(added);
      } finally {
        add.mockRestore();
        remove.mockRestore();
      }
    });
  });

  describe('empty board', () => {
    it('an empty board says how to add a note', () => {
      renderBoard(initialBoardState);

      expect(hint()).not.toBeNull();
      expect(notes()).toHaveLength(0);
    });

    it('a board with notes shows no hint', () => {
      renderBoard(boardWith(1));

      expect(hint()).toBeNull();
    });

    it('creating the first note removes the hint', () => {
      renderBoard(initialBoardState);

      press(board(), 300, 200);
      release();

      expect(hint()).toBeNull();
      expect(notes()).toHaveLength(1);
    });

    it('the hint hides while a note is drawn and returns if it is abandoned', () => {
      renderBoard(initialBoardState);

      press(board(), 300, 200);
      // Still a click: nothing is drawn yet.
      expect(hint()).not.toBeNull();
      move(500, 400);
      expect(hint()).toBeNull();
      pressKey('Escape');

      expect(hint()).not.toBeNull();
    });

    it('deleting the last note brings the hint back', () => {
      renderBoard(boardWith(1));

      press(noteAt(0), 100, 100);
      move(950, 700);
      release();

      expect(hint()).not.toBeNull();
    });
  });
});
