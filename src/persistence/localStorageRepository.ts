import type { BoardState } from '../domain/board.ts';
import type { NotesRepository } from './notesRepository.ts';
import { parseBoardState } from './parseBoardState.ts';

/**
 * The key carries the format version: a change to the saved shape gets a new key, so a value in
 * the old shape is never read as the new one, and stays where it is.
 */
export const STORAGE_KEY = 'sticky-notes:v1';

/** The part of the Storage interface the repository uses. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Keeps the board, in JSON, under STORAGE_KEY. `getStorage` is called on every load and save:
 * reading `window.localStorage` itself throws where storage is blocked, and that error belongs to
 * the operation (a rejected promise), not to whoever creates the repository.
 */
export function createLocalStorageRepository(getStorage: () => KeyValueStorage): NotesRepository {
  return {
    load: () =>
      new Promise((resolve) => {
        resolve(readBoard(getStorage().getItem(STORAGE_KEY)));
      }),
    save: (state) =>
      // The executor runs before save() returns, so the write is done by then: a save made while
      // the page is being hidden reaches storage before the page can be frozen or closed. A
      // throwing write (quota, blocked storage) rejects the promise instead of throwing.
      new Promise((resolve) => {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
        resolve();
      }),
  };
}

function readBoard(raw: string | null): BoardState | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Not JSON: like any other value this app did not write, there is no board to load.
    return null;
  }
  return parseBoardState(value);
}
