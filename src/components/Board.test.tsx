// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { boardReducer, initialBoardState, type BoardState } from '../domain/board.ts';
import { asNoteId } from '../domain/ids.ts';
import { Board } from './Board.tsx';
import { subscribeNoteRenders } from './renderProbe.ts';

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(cleanup);

beforeAll(() => {
  // jsdom has no pointer capture; the hook calls it on every press.
  Element.prototype.setPointerCapture = vi.fn();
  // jsdom does no layout, and the clamp needs a board size.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1024);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(768);
});

afterAll(() => {
  vi.restoreAllMocks();
});

interface HarnessProps {
  readonly initial: BoardState;
  /** 'inline' passes a new wrapper around dispatch on every render, defeating memo. */
  readonly dispatchProp: 'stable' | 'inline';
}

function Harness({ initial, dispatchProp }: HarnessProps) {
  const [state, dispatch] = useReducer(boardReducer, initial);
  return (
    <Board
      notes={state.notes}
      dispatch={
        dispatchProp === 'stable'
          ? dispatch
          : (action) => {
              dispatch(action);
            }
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

/** Note '0' is the first one created, so it is the first article in the DOM. */
function firstNote(): HTMLElement {
  const note = screen.getAllByRole('article')[0];
  if (note === undefined) throw new Error('no note on the board');
  return note;
}

function press(note: HTMLElement, clientX: number, clientY: number, button = 0): void {
  fireEvent.pointerDown(note, { button, pointerId: 1, clientX, clientY });
}

function move(note: HTMLElement, clientX: number, clientY: number): void {
  fireEvent.pointerMove(note, { pointerId: 1, clientX, clientY });
}

/** Presses note '0', then records which notes render during one move. */
function notesRenderedByOneMove(note: HTMLElement): string[] {
  press(note, 100, 100);
  // Subscribing after the press keeps the bring-to-front render out of the count.
  const rendered: string[] = [];
  const unsubscribe = subscribeNoteRenders((id) => {
    rendered.push(id);
  });
  move(note, 130, 150);
  unsubscribe();
  return rendered;
}

describe('Board', () => {
  it.each([1, 50])('moving one note re-renders only that note (%i notes)', (count) => {
    render(<Harness initial={boardWith(count)} dispatchProp="stable" />);
    const note = firstNote();

    const rendered = notesRenderedByOneMove(note);

    expect(rendered).toEqual(['0']);
    // The note really moved, so the count can't pass by nothing rendering.
    expect(note.style.transform).toBe('translate(40px, 60px)');
  });

  it('the render probe sees every note when the dispatch prop is unstable', () => {
    // The probe's own control: it must report notes that were not dispatched to. A probe that
    // only reported the dispatched note would pass the test above and fail this one.
    render(<Harness initial={boardWith(50)} dispatchProp="inline" />);

    const rendered = notesRenderedByOneMove(firstNote());

    expect(rendered).toHaveLength(50);
  });

  it('pressing a note brings it to the front', () => {
    render(<Harness initial={boardWith(3)} dispatchProp="stable" />);
    const note = firstNote();

    press(note, 100, 100);

    // Three creations used z 1–3, so the next z is 4.
    expect(note.style.zIndex).toBe('4');
  });

  it('positions the note from the press point, not by summing moves', () => {
    render(<Harness initial={boardWith(1)} dispatchProp="stable" />);
    const note = firstNote();

    press(note, 100, 100);
    move(note, 130, 150);
    move(note, 140, 160);

    expect(note.style.transform).toBe('translate(50px, 70px)');
  });

  it('keeps the note inside the board', () => {
    render(<Harness initial={boardWith(1)} dispatchProp="stable" />);
    const note = firstNote();

    press(note, 100, 100);
    move(note, 5000, -5000);
    // 1024 − 100 on x, 0 on y.
    expect(note.style.transform).toBe('translate(924px, 0px)');

    // The position comes from the press point, so leaving the clamped zone tracks the pointer
    // immediately instead of walking back from the edge.
    move(note, 130, 150);
    expect(note.style.transform).toBe('translate(40px, 60px)');
  });

  it('ignores presses with a non-primary button', () => {
    render(<Harness initial={boardWith(1)} dispatchProp="stable" />);
    const note = firstNote();

    press(note, 100, 100, 2);
    move(note, 130, 150);

    expect(note.style.transform).toBe('translate(10px, 10px)');
  });

  it('stops following the pointer after release', () => {
    render(<Harness initial={boardWith(1)} dispatchProp="stable" />);
    const note = firstNote();

    press(note, 100, 100);
    move(note, 130, 150);
    const released = note.style.transform;
    // The drag was live before the release, so the final check can't pass by never moving.
    expect(released).toBe('translate(40px, 60px)');
    fireEvent.pointerUp(note, { pointerId: 1, clientX: 130, clientY: 150 });
    move(note, 200, 200);

    expect(note.style.transform).toBe(released);
  });
});
