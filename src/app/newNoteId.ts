import { asNoteId, type NoteId } from '../domain/ids.ts';

/** A fresh note id. Random ids live here, outside the domain, which stays deterministic. */
export function newNoteId(): NoteId {
  return asNoteId(crypto.randomUUID());
}
