# Sticky notes

A single-page sticky-notes board for the desktop, written in React and TypeScript without
component libraries. The only runtime dependencies are `react` and `react-dom`; layout, drag
handling and styles are written for this app.

## Running it

Requires Node.js 24 and pnpm 10. Node 24 ships Corepack, so `corepack enable` installs the pnpm
version pinned in `package.json`; on newer Node, install Corepack or pnpm 10 separately.

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `pnpm verify` | Lint (including the layer rules), unit and component tests, type check, production build, and a check that the build doesn't contain the end-to-end read seam. CI runs it as its first job. |
| `pnpm e2e` | End-to-end tests in real browsers (Playwright, 1024×768). Starts its own dev server on port 5199. CI runs it on Chromium and Firefox as its second job. |
| `pnpm build` / `pnpm preview` | Production build into `dist/`, and a local server for it. |

Before the first `pnpm e2e`, download Playwright's browsers once with
`pnpm exec playwright install chromium firefox`. The `chrome` and `msedge` projects use the
installed Google Chrome and Microsoft Edge; to run without them:
`pnpm e2e --project=chromium --project=firefox`.

## Features

All four required features:

- **Create** a note by dragging a rectangle on the empty board (the note takes that size and
  position), or by clicking, which creates a 200×150 note at the click point.
- **Resize** a note by dragging the handle in its bottom-right corner.
- **Move** a note by dragging it.
- **Delete** a note by dropping it on the trash in the bottom-right corner. The trash highlights
  while a note is being dragged and turns red when releasing would delete.

Optional features done:

- **Text editing.** A new note opens ready for typing; double-click a note to edit it again.
  Escape or a click elsewhere finishes editing.
- **Bring to front.** Pressing a note brings it in front of the notes it overlaps.
- **Local storage.** The board is saved to `localStorage` and restored on load.

Not done: note colours and a REST API. Storage goes through an asynchronous repository interface,
so a REST-backed one can replace the local one without changing the code that uses it.

Also: Escape during a drag cancels it (a moved note goes back, a resized note gets its size
back, a note being drawn is discarded), and an empty board shows how to start.

## Assumptions

- The board is the browser window. Notes are created, moved and resized fully inside it, and are
  at least 80×60; making the window smaller does not move existing notes back in.
- The app is used with a mouse or trackpad. Moving, resizing and creating have no keyboard
  equivalent, and touch screens are not a target.
- Releasing a note over the trash deletes it at once, without confirmation or undo. The pointer,
  not the note's edge, has to be over the trash, so a large note isn't deleted by grazing it.
- One tab at a time: two open tabs each save their own board, and the last one to save wins.
- Data in storage that the app can't read (another format, a hand edit) is ignored: the board
  starts empty, and the stored value is left untouched until the first change.

## Browser support

Tested with the end-to-end suite on Windows 11 at 1024×768, Playwright 1.64.1:

| Browser | Version | How |
|---|---|---|
| Google Chrome | 156.0.8078.80 | installed browser |
| Microsoft Edge | 156.0.4314.58 | installed browser |
| Chromium | 156.0.8078.4 | Playwright's build |
| Firefox | 157.0 | Playwright's build of Firefox, not Mozilla's release |

Not tested: Chrome on macOS, Firefox on macOS and Linux, and Mozilla's own Firefox release.
A CI job is set up to run the suite on Chromium and Firefox on Linux; it has not run yet.

## Architecture

The code is split into five layers with one-way imports: `domain` (notes, geometry and the
board reducer, plain TypeScript), `interaction` (pointer and editor input turned into domain
actions), `components` (rendering), `persistence` (storage) and `app` (wiring). ESLint enforces
the boundaries: each layer below `app` has `no-restricted-imports` rules whose messages say
where the code belongs instead, and `domain` may not touch `window`, `document`, randomness or
the clock, so it runs in plain Node tests. `tests/architecture` lints a deliberately broken file
per rule to prove each rule still fires.

All pointer input is owned by the board. One hook, `useBoardGesture`, handles presses on the
board element, works out what was pressed (a note, its resize handle, the trash or the empty
board) and captures the pointer on the board, which is never removed, so a gesture keeps
receiving events when the pointer outruns its note or the note is deleted. The gesture in
progress is a discriminated union (`idle`, `moving`, `resizing`, `creating`) kept in a ref, so a
state such as "resizing without a note" can't be written. Every way a gesture ends goes through
one function with an outcome: completed (pointer up), aborted (the system took the pointer away)
or reverted (Escape). Whether the pointer is over the trash is a pure hit test in `domain`,
because pointer capture stops the trash from receiving enter and leave events.
See [ADR-001](docs/adr/001-interaction-model.md).

The board state lives in one `useReducer` with discriminated-union actions. The reducer keeps the
identity of every note it doesn't change, and notes are memoized components whose only props are
their note and whether it is being edited, so dragging or typing re-renders just that note. A
render-count test enforces this with 50 notes, using a `<Profiler>` inside the note component;
a control case, where every note object is recreated on each render, checks that the probe does
report all 50. The state is saved through an asynchronous `NotesRepository` (`load` and `save`
return promises) 300 ms after changes settle and when the page is hidden; the stored JSON is
checked field by field when read, without type casts. The localStorage adapter is the only
implementation today; a REST one would implement the same interface.
See [ADR-002](docs/adr/002-persistence.md).

## Known issues

- In Chrome on Windows, right after dragging a note and opening its editor, the text cursor can
  stay invisible for about 2–3 seconds. The app state is correct during that time (focus, gesture
  state and computed cursor were verified); the cause looks like a cursor-rendering detail in the
  browser and was not isolated.
