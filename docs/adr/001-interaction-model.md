# ADR-001: Interaction model

**Status:** Accepted

## Context

The board lets the user move, resize, create and delete notes by dragging with the mouse, and
bring a note to the front by pressing it. During a drag the position of one note changes on
every `pointermove`, so the design has to answer three questions:

- who owns a note's position while it is being dragged;
- how pointer input reaches that owner without re-rendering every note on the board;
- how the app knows the pointer is over the trash while a note is held.

## Decision

**One `useReducer` owns all notes.** `BoardState` (in `src/domain/board.ts`) is the single source
of truth for every note's rectangle, stacking order and text. Components never hold their own
copy of a position.

**The board owns the single active gesture.** One hook in `src/interaction/`, attached to the
board element and built on Pointer Events, classifies each press (a note, identified by a
`data-note-id` attribute, or the empty board) and captures the pointer **on the board**, so
`pointermove` and `pointerup` keep reaching it even when the cursor outruns the note. It keeps the
gesture as a discriminated union in one ref (its members grow as move, resize and create are
built), so impossible combinations, such as resizing without a note, don't type-check. Why the
board: there is one owner, so a press on a note can't also start a board gesture by bubbling; the
board is never removed, while a note can be deleted mid-gesture (the browser then reports lost
capture to the document, not to the note); and the owner knows which note is held, which the
trash highlight and Escape will need.

**During a drag the hook dispatches on every `pointermove`.** Notes are `React.memo` components
that receive only their own `note` object (no `dispatch`: pointer input is handled by the board),
and the reducer keeps the identity of every note it doesn't change. Together these mean only the
dragged note re-renders.

**"Over the trash" is a geometric test in `src/domain/`.** Pointer capture retargets events to the
capturing element, so the trash never receives `pointerenter` or `pointerleave` while a note is
held. Instead, the pointer position is compared with the trash's rectangle: a pure function that is
unit-testable without a DOM.

**Stacking order is a `z` field, not array order.** Each note has a `z`, and `BoardState.nextZ` is
the single owner of the next value. Bringing a note to the front sets its `z` to `nextZ` and bumps
`nextZ`. This changes one CSS value (`z-index`) instead of reordering DOM nodes, and DOM order
(hence Tab order) stays creation order. Reordering would no longer disturb the pointer capture,
because the capture is on the board, which never moves; the reasons above are the ones that
remain.

## Alternatives considered

**(a) Each note keeps its position in local state and commits it on `pointerup`.** This makes
two owners of a note's position during a drag. The trash test and the stacking logic need the live
position, so they would have to read component state or wait for the drop.

**(b) Mutate `style.transform` through refs and bypass React during a drag.** This is the fastest
option, but state and screen disagree for the whole gesture, and anything that reads state (the
trash test, stacking) sees stale values. It is premature until a render count shows the
React path is too slow.

**(c) The HTML Drag and Drop API.** Rejected without measurement. It gives no live position to
render while dragging (the browser draws a ghost image instead), and resizing and
create-by-drag would still need pointer events, so the app would have two input models.

## Consequences

- DOM order is creation order, not visual order, so Tab order and screen readers follow creation
  order. Accepted for this scope.
- `z` only grows. It stays far below the CSS `z-index` limit (2³¹ − 1) for any realistic session.
- The reducer must keep untouched notes by identity; `src/domain/board.test.ts` checks it.
  `src/components/Board.test.tsx` measures renders with a `<Profiler>` inside the note component
  and checks that moving one note re-renders exactly that note whether the board has 1 or 50
  notes, and that pressing one re-renders only that note. Notes receive only their `note`, so an
  unstable `dispatch` can't reach them. The test's controls are a non-memoized note and notes
  whose objects change on every render: both re-render every note, so the first fails the count
  and the second shows the probe sees notes that were not moved.
