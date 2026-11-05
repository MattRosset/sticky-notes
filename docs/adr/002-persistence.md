# ADR-002: Persistence

**Status:** Accepted

## Context

The board must survive a reload: the notes, where they are, their size, stacking order and text.
The data lives in the browser for now, but it may later live on a server, so the rest of the app
should not depend on how or where it is stored. A drag or a burst of typing changes the state
dozens of times a second, and what is in storage may not be something this app wrote (another
version, a hand edit, a broken write).

## Decision

**An asynchronous repository.** `NotesRepository` in `src/persistence/` has
`load(): Promise<BoardState | null>` and `save(state): Promise<void>`. localStorage is synchronous,
but the app never relies on that, so a server-backed repository can replace the local one without
changing its callers. Only `src/app/` knows which repository is used; components and interaction
code never import it.

**The stored value is the `BoardState` JSON, under `sticky-notes:v1`.** The format version is in
the key: a different shape gets a new key, so a value in the old shape is never read as the new one
and stays where it is. Storage errors (blocked storage, a full quota) reject the returned promise
instead of throwing; text that is not JSON loads as no board.

**Parsing at the boundary.** `parseBoardState` takes `unknown`, so it works on any decoded value,
checks every field with `typeof`, `in` and `Array.isArray`, and rebuilds the board from the checked
fields only; nothing is cast. One bad note rejects the whole board rather than dropping that note.
Nothing is lost by refusing, because loading never writes: the stored value stays untouched until
the user's first change. The board component only saves a state that is not the loaded one, and
the reducer returns the same object for an action that changes nothing.

**Saving.** Changes are saved with a trailing debounce of 300 ms: each change restarts the wait,
and only the latest state is written. `pagehide` and unmounting save whatever is waiting at once.
The write itself happens synchronously inside `save()`, before it returns, because the page may be
frozen or closed right after `pagehide`; a save that awaited before writing would lose the last
change. A failed save is logged, never left as an unhandled rejection.

**The load gate.** Nothing is drawn until the load settles, so nobody can change a board that is
about to be replaced. A failed load logs the error and starts an empty board.

## Alternatives considered

**sessionStorage.** Same API, but it is cleared when the tab closes, which defeats the point.

**IndexedDB.** Asynchronous and much larger, but the board is a few kilobytes of JSON, and its
transactions add code without a need. The repository interface keeps it open for later.

**Saving on every change.** Simple, but a drag writes and serialises the whole board on every
pointer move, and typing on every keystroke.

**Saving only on `pagehide`.** One write per visit, but a crash, a killed tab or a lost battery
loses everything since the page opened.

## Consequences

- A gesture or a typing burst is one write.
- A crash, where `pagehide` never fires, can lose at most the last 300 ms of changes.
- Two tabs overwrite each other: the last write wins, and there is no `storage` event sync.
- Notes saved in a larger window may lie outside a smaller one; nothing moves them back in.
