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
`data-note-id` attribute; a note's resize handle, a `data-resize-handle` child of the note, found
with `closest`; the trash (a press on it starts nothing); or the empty board) and captures the
pointer **on the board**, so `pointermove` and `pointerup` keep reaching it even when the cursor
outruns the note. It keeps the gesture as a discriminated union in one ref (moving, resizing and
creating), so impossible combinations, such
as resizing without a note, don't type-check. Why the
board: there is one owner, so a press on a note can't also start a board gesture by bubbling; the
board is never removed, while a note can be deleted mid-gesture (the browser then reports lost
capture to the document, not to the note); and the owner knows which note is held, which the
trash highlight and Escape use.

**During a drag the hook dispatches on every `pointermove`.** Notes are `React.memo` components
that receive only their own `note` object (no `dispatch`: pointer input is handled by the board),
and the reducer keeps the identity of every note it doesn't change. Together these mean only the
dragged note re-renders.

**Creating and resizing.** A press on the empty board is a click until the pointer moves more
than 4 px on either axis from the press point (the drag rectangle Windows uses to tell a click
from a drag), then a drag for the rest of the gesture, even if the pointer comes back. A click
creates a 200×150 note at the press point; a drag creates the dragged rectangle, grown to at least
80×60 from the press point and kept inside the board. Release creates exactly the previewed rect.
Pointerup completes a gesture; pointercancel, or a lost capture of the board, aborts it (a child's
lost capture is ignored), and an aborted create leaves no note. Resizing uses one handle, at the
bottom-right corner, because it is the conventional affordance and keeps a resize a size-only
change: the top-left stays where it is.

**What the board draws.** The gesture stays in the ref. What the board draws for it (which
gesture is active, for the cursor; whether the pointer is over the trash; the creation preview) is
one small React state that changes only when the drawing does, so a move that stays on one side of
the trash's edge renders nothing extra. During a gesture the board sets the cursor on itself and
every descendant, because under capture the element under the pointer would otherwise decide.
Notes live in their own layer (`isolation: isolate`), so their ever-growing `z-index` can't rise
above the preview or the trash.

**Editing text.** Which note is being edited is UI state in a second hook in `src/interaction/`,
not part of `BoardState`, so it is never saved. The editor is an uncontrolled `<textarea>`, and its
`change`, `keydown` and `blur` events are handled on the board, where they bubble, like pointer
input: a note still receives only its `note` and one boolean, whether it is being edited, so
typing and opening or closing the editor re-render only that note. A controlled editor would need
a change callback on every note. Each change dispatches the note's whole new text. A double-click
edits the note the last press landed on, not the double-click's target: measured in Chrome, with
the pointer captured on the board, `click` and `dblclick` are targeted at the board, so the target
can't say which note was clicked. A press in the editor starts no gesture, so the text keeps
native caret placement and selection; any other press finishes editing first, and on the empty
board that is all it does, so a click to leave a note doesn't leave a new note behind. A new note
opens in the editor. Escape in the editor blurs it, and the blur ends editing; the window's Escape
listener, which cancels gestures, is unchanged.

**"Over the trash" is a geometric test in `src/domain/`.** Pointer capture retargets events to the
capturing element, so the trash never receives `pointerenter` or `pointerleave` while a note is
held. Instead, the trash's rectangle is read from the DOM when a note is pressed and the pointer is
compared with it in board coordinates by `containsPoint`, a pure function in `src/domain/` that is
unit-testable without a DOM; the pointer, not the note, must be inside, so a large note can't be
deleted by grazing the trash.

**Deleting and cancelling.** Releasing while the pointer is over the trash deletes the note,
without confirmation; pointercancel or a lost capture never deletes. Escape reverts any gesture: a
moved note returns to where it started, a resized note gets its size back, a drawn note is
discarded. It is caught on the window, because pressing the board focuses nothing.

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
  and the second shows the probe sees notes that were not moved. The same test checks that dragging
  out a new note re-renders no note and its release renders only the new one, and that resizing
  re-renders only the resized note. It also checks that the trash highlight re-renders no note,
  that deleting a note re-renders no other note, and that Escape re-renders only the note it puts
  back.
