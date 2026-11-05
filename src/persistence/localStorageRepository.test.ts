import { describe, expect, it } from 'vitest';
import type { BoardState } from '../domain/board.ts';
import { asNoteId } from '../domain/ids.ts';
import { createLocalStorageRepository, STORAGE_KEY } from './localStorageRepository.ts';

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

function board(): BoardState {
  return {
    notes: [
      {
        id: asNoteId('a'),
        rect: { x: 10, y: 20, width: 200, height: 150 },
        z: 1,
        text: 'Line 1\nLine 2 ✓',
      },
    ],
    nextZ: 2,
  };
}

describe('localStorageRepository', () => {
  it('nothing saved loads as null', async () => {
    const { storage } = memoryStorage();
    const repository = createLocalStorageRepository(() => storage);

    expect(await repository.load()).toBeNull();
  });

  it('a saved board loads back equal', async () => {
    const { storage } = memoryStorage();
    const repository = createLocalStorageRepository(() => storage);

    await repository.save(board());

    expect(await repository.load()).toEqual(board());
  });

  it('saves the board as JSON under sticky-notes:v1, and nothing else', async () => {
    const { storage, writes } = memoryStorage();
    const repository = createLocalStorageRepository(() => storage);

    await repository.save(board());

    expect(STORAGE_KEY).toBe('sticky-notes:v1');
    expect(writes).toEqual([['sticky-notes:v1', JSON.stringify(board())]]);
  });

  it('the write is done when save returns', async () => {
    const { storage, values } = memoryStorage();
    const repository = createLocalStorageRepository(() => storage);

    const saving = repository.save(board());

    // Not awaited yet: a page being hidden may never get to run the continuation.
    expect(values.get(STORAGE_KEY)).toBe(JSON.stringify(board()));
    await saving;
  });

  it('unreadable data loads as null and stays untouched', async () => {
    const { storage, values, writes } = memoryStorage({ [STORAGE_KEY]: '{not json' });
    const repository = createLocalStorageRepository(() => storage);

    expect(await repository.load()).toBeNull();
    expect(writes).toEqual([]);
    expect(values.get(STORAGE_KEY)).toBe('{not json');
  });

  it('JSON that is not a board loads as null', async () => {
    const { storage, writes } = memoryStorage({ [STORAGE_KEY]: '{"notes":"x","nextZ":1}' });
    const repository = createLocalStorageRepository(() => storage);

    expect(await repository.load()).toBeNull();
    expect(writes).toEqual([]);
  });

  it('storage errors reject instead of throwing', async () => {
    const blocked = createLocalStorageRepository(() => {
      throw new Error('blocked');
    });
    let loading: Promise<BoardState | null> | undefined;
    let saving: Promise<void> | undefined;

    expect(() => {
      loading = blocked.load();
    }).not.toThrow();
    expect(() => {
      saving = blocked.save(board());
    }).not.toThrow();
    await expect(loading).rejects.toThrow('blocked');
    await expect(saving).rejects.toThrow('blocked');

    const full = createLocalStorageRepository(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    }));

    await expect(full.save(board())).rejects.toThrow('quota');
  });

  it('a value under another key is ignored', async () => {
    const { storage } = memoryStorage({ 'sticky-notes:v0': JSON.stringify(board()) });
    const repository = createLocalStorageRepository(() => storage);

    expect(await repository.load()).toBeNull();
  });
});
