declare const noteIdBrand: unique symbol;

/** A note id. Branded so a random string can't be passed where a note id is expected. */
export type NoteId = string & { readonly [noteIdBrand]: true };

export function asNoteId(raw: string): NoteId {
  return raw as NoteId;
}
