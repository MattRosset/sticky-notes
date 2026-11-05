import type { BoardState } from '../domain/board.ts';
import type { Rect } from '../domain/geometry.ts';
import { asNoteId } from '../domain/ids.ts';
import { MIN_NOTE_SIZE, type Note } from '../domain/note.ts';

/**
 * Rebuilds a board from data read back from storage, or returns null if it is not a board this
 * app could have saved. Storage is outside the program: another tab, an older version or a hand
 * edit may have put anything there, so every field is checked before it reaches the state, and
 * the result is built from the checked fields only, so unknown extra fields are dropped.
 *
 * One bad note rejects the whole board: keeping the rest would silently drop that note, while
 * refusing loses nothing, because the stored value is left untouched until the user changes the
 * board.
 */
export function parseBoardState(value: unknown): BoardState | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('notes' in value && 'nextZ' in value)) return null;
  const { notes, nextZ } = value;
  if (!isStackOrder(nextZ) || !Array.isArray(notes)) return null;
  const items: readonly unknown[] = notes;
  const parsed: Note[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    const note = parseNote(item);
    if (note === null || ids.has(note.id)) return null;
    // Every z is below nextZ, or the next note brought to front would not land in front.
    if (note.z >= nextZ) return null;
    ids.add(note.id);
    parsed.push(note);
  }
  return { notes: parsed, nextZ };
}

function parseNote(value: unknown): Note | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('id' in value && 'rect' in value && 'z' in value && 'text' in value)) return null;
  const { id, rect, z, text } = value;
  if (typeof id !== 'string' || id === '') return null;
  if (!isStackOrder(z) || typeof text !== 'string') return null;
  const parsedRect = parseRect(rect);
  if (parsedRect === null) return null;
  return { id: asNoteId(id), rect: parsedRect, z, text };
}

function parseRect(value: unknown): Rect | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('x' in value && 'y' in value && 'width' in value && 'height' in value)) return null;
  const { x, y, width, height } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;
  // Notes are created and resized at least this big; a smaller one was not saved by this app.
  if (width < MIN_NOTE_SIZE.width || height < MIN_NOTE_SIZE.height) return null;
  return { x, y, width, height };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A note's z or the board's nextZ: a whole number from 1 up, as the reducer assigns them. */
function isStackOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
