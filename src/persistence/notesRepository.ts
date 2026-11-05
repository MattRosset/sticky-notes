import type { BoardState } from '../domain/board.ts';

/**
 * Where the board is kept between visits. Asynchronous although localStorage is not, so a
 * server-backed implementation can replace the local one without changing its callers.
 */
export interface NotesRepository {
  /** The saved board, or null when there is none this app can use (never saved, or unreadable). */
  readonly load: () => Promise<BoardState | null>;
  readonly save: (state: BoardState) => Promise<void>;
}
