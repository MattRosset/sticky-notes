// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardState } from '../domain/board.ts';
import { asNoteId, type NoteId } from '../domain/ids.ts';
import {
  createLocalStorageRepository,
  STORAGE_KEY,
} from '../persistence/localStorageRepository.ts';
import type { NotesRepository } from '../persistence/notesRepository.ts';
import { parseBoardState } from '../persistence/parseBoardState.ts';
import { NotesApp } from './NotesApp.tsx';

// jsdom has no pointer capture; the board calls it on every primary-button press.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
});

beforeEach(() => {
  vi.useFakeTimers();
});

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const savedBoard: BoardState = {
  notes: [
    { id: asNoteId('a'), rect: { x: 10, y: 10, width: 100, height: 100 }, z: 1, text: '' },
    { id: asNoteId('b'), rect: { x: 300, y: 300, width: 100, height: 100 }, z: 2, text: '' },
  ],
  nextZ: 3,
};

/** A repository whose load the test chooses, recording every save. */
function fakeRepository(load: () => Promise<BoardState | null>) {
  const saves: BoardState[] = [];
  const repository: NotesRepository = {
    load,
    save: (state) => {
      saves.push(state);
      return Promise.resolve();
    },
  };
  return { repository, saves };
}

/** A load that stays pending until the test resolves it. */
function pendingLoad() {
  let resolve: (board: BoardState | null) => void = () => undefined;
  const promise = new Promise<BoardState | null>((settle) => {
    resolve = settle;
  });
  return {
    load: () => promise,
    resolve: (board: BoardState | null) => {
      resolve(board);
    },
  };
}

/** A Map-backed storage that records writes. */
function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    values,
    writes,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push([key, value]);
        values.set(key, value);
      },
    },
  };
}

/** Ids 'new-1', 'new-2', … in creation order. */
function idSequence(): () => NoteId {
  let count = 0;
  return () => {
    count += 1;
    return asNoteId(`new-${String(count)}`);
  };
}

function renderApp(repository: NotesRepository) {
  return render(<NotesApp repository={repository} createNoteId={idSequence()} />);
}

/** Lets a settled load reach the component. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** jsdom does no layout: gives the board the size and position `renderBoard` gives it. */
function sizeBoard(): void {
  const element = board();
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 1024 });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 768 });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 1024, 768),
  });
}

function board(): HTMLElement {
  return screen.getByRole('main');
}

function notes(): HTMLElement[] {
  return screen.queryAllByRole('article');
}

function noteAt(index: number): HTMLElement {
  const note = notes()[index];
  if (note === undefined) throw new Error(`no note at index ${String(index)}`);
  return note;
}

function hint(): HTMLElement | null {
  return screen.queryByText('Click anywhere to add a note, or drag to draw one.');
}

function press(element: HTMLElement, clientX: number, clientY: number): void {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX, clientY });
}

// With the pointer captured on the board, moves and releases are targeted there.
function move(clientX: number, clientY: number): void {
  fireEvent.pointerMove(board(), { pointerId: 1, clientX, clientY });
}

function release(): void {
  fireEvent.pointerUp(board(), { pointerId: 1 });
}

/** A click on the empty board, which creates a note there. */
function clickBoard(clientX: number, clientY: number): void {
  press(board(), clientX, clientY);
  release();
}

function pageHide(): void {
  fireEvent(window, new Event('pagehide'));
}

function storedValue(values: ReadonlyMap<string, string>): string {
  const value = values.get(STORAGE_KEY);
  if (value === undefined) throw new Error('nothing stored');
  return value;
}

describe('NotesApp', () => {
  it('shows nothing until the load settles, then the saved notes', async () => {
    const pending = pendingLoad();
    renderApp(fakeRepository(pending.load).repository);

    expect(screen.queryByRole('main')).toBeNull();

    pending.resolve(savedBoard);
    await settle();

    expect(notes()).toHaveLength(2);
    expect(noteAt(0).style.transform).toBe('translate(10px, 10px)');
  });

  it('with nothing saved, the board starts empty with the hint', async () => {
    renderApp(fakeRepository(() => Promise.resolve(null)).repository);
    await settle();

    expect(notes()).toHaveLength(0);
    expect(hint()).not.toBeNull();
  });

  it('loading saves nothing', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(savedBoard));
    const { unmount } = renderApp(repository);
    await settle();

    vi.advanceTimersByTime(10_000);
    pageHide();
    unmount();

    expect(saves).toEqual([]);
  });

  it('a change is saved once, 300 ms after it', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(null));
    renderApp(repository);
    await settle();
    sizeBoard();

    clickBoard(300, 200);
    vi.advanceTimersByTime(299);

    expect(saves).toHaveLength(0);

    vi.advanceTimersByTime(1);

    expect(saves).toHaveLength(1);
    expect(saves[0]?.notes).toHaveLength(1);
    expect(saves[0]?.notes[0]?.rect).toMatchObject({ x: 300, y: 200 });
  });

  it('a drag is saved once, with where the note ended', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(savedBoard));
    renderApp(repository);
    await settle();
    sizeBoard();

    press(noteAt(0), 50, 50);
    for (let step = 1; step <= 20; step += 1) {
      if (step > 1) vi.advanceTimersByTime(10);
      move(50 + step * 10, 50 + step * 5);
    }
    release();
    vi.advanceTimersByTime(299);

    expect(saves).toHaveLength(0);

    vi.advanceTimersByTime(1);

    expect(saves).toHaveLength(1);
    expect(saves[0]?.notes[0]?.rect).toMatchObject({ x: 210, y: 110 });
  });

  it('pagehide saves the waiting change at once, and only once', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(null));
    renderApp(repository);
    await settle();
    sizeBoard();

    clickBoard(300, 200);
    pageHide();

    expect(saves).toHaveLength(1);

    vi.advanceTimersByTime(1000);

    expect(saves).toHaveLength(1);
  });

  it('unmounting saves the waiting change', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(null));
    const { unmount } = renderApp(repository);
    await settle();
    sizeBoard();

    clickBoard(300, 200);
    unmount();

    expect(saves).toHaveLength(1);
  });

  it('a failed load starts an empty board', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp(fakeRepository(() => Promise.reject(new Error('blocked'))).repository);
    await settle();

    expect(notes()).toHaveLength(0);
    expect(hint()).not.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('under StrictMode, loading saves nothing and a change saves once', async () => {
    const { repository, saves } = fakeRepository(() => Promise.resolve(savedBoard));
    render(
      <StrictMode>
        <NotesApp repository={repository} createNoteId={idSequence()} />
      </StrictMode>,
    );
    await settle();
    sizeBoard();

    vi.advanceTimersByTime(1000);
    pageHide();

    expect(saves).toHaveLength(0);

    clickBoard(600, 100);
    vi.advanceTimersByTime(300);

    expect(saves).toHaveLength(1);
  });

  it('unreadable stored data is kept until the first change', async () => {
    const { storage, values, writes } = memoryStorage({ [STORAGE_KEY]: '{not json' });
    renderApp(createLocalStorageRepository(() => storage));
    await settle();
    sizeBoard();

    expect(notes()).toHaveLength(0);

    vi.advanceTimersByTime(1000);
    pageHide();

    expect(values.get(STORAGE_KEY)).toBe('{not json');
    expect(writes).toEqual([]);

    clickBoard(300, 200);
    vi.advanceTimersByTime(300);

    expect(parseBoardState(JSON.parse(storedValue(values)))?.notes).toHaveLength(1);
  });

  it('a saved board comes back after a reload', async () => {
    const { storage } = memoryStorage();
    const first = renderApp(createLocalStorageRepository(() => storage));
    await settle();
    sizeBoard();

    clickBoard(300, 200);
    vi.advanceTimersByTime(300);
    first.unmount();

    renderApp(createLocalStorageRepository(() => storage));
    await settle();

    expect(notes()).toHaveLength(1);
    expect(noteAt(0).style.transform).toBe('translate(300px, 200px)');
  });

  it('a load that settles after unmounting shows nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending = pendingLoad();
    const { unmount } = renderApp(fakeRepository(pending.load).repository);

    unmount();
    pending.resolve(savedBoard);
    await settle();

    expect(screen.queryByRole('main')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});
