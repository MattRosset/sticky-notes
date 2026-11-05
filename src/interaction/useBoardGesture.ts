import { useRef, useState, type Dispatch, type PointerEvent, type RefObject } from 'react';
import type { BoardAction } from '../domain/board.ts';
import {
  containsPoint,
  movedPosition,
  rectAt,
  rectFromDrag,
  resizedSize,
  type Point,
  type Rect,
  type Size,
} from '../domain/geometry.ts';
import type { NoteId } from '../domain/ids.ts';
import { DEFAULT_NOTE_SIZE, MIN_NOTE_SIZE, type Note } from '../domain/note.ts';

type Gesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'moving';
      readonly pointerId: number;
      /** Pointer position at press, in client coordinates. */
      readonly origin: Point;
      readonly noteId: NoteId;
      /** The note's rect at press time; every move is computed from it, never accumulated. */
      readonly startRect: Rect;
      /** Board size at press time. */
      readonly bounds: Size;
      /** The board's top-left in client coordinates, at press time. */
      readonly boardOrigin: Point;
      /** The trash's rect in board coordinates at press time, or null if it isn't rendered. */
      readonly trash: Rect | null;
      /** Whether the pointer was over the trash at the last move: releasing then deletes. */
      readonly overTrash: boolean;
    }
  | {
      readonly kind: 'resizing';
      readonly pointerId: number;
      /** Pointer position at press, in client coordinates. */
      readonly origin: Point;
      readonly noteId: NoteId;
      /** The note's rect at press time; every resize is computed from it, never accumulated. */
      readonly startRect: Rect;
      /** Board size at press time. */
      readonly bounds: Size;
    }
  | {
      readonly kind: 'creating';
      readonly pointerId: number;
      /** Pointer position at press, in client coordinates (for the click threshold). */
      readonly origin: Point;
      /** The board's top-left in client coordinates, at press time. */
      readonly boardOrigin: Point;
      /** The press point in board coordinates: the corner the new note grows from. */
      readonly anchor: Point;
      readonly bounds: Size;
      /** The rect being dragged out, or null while the press is still a click. */
      readonly draft: Rect | null;
    };

type ActiveGesture = Exclude<Gesture, { readonly kind: 'idle' }>;

/**
 * How a gesture ends. pointerup completes it. pointercancel or a lost capture aborts it: the
 * system took the pointer away, so what already happened stays, but nothing is deleted or
 * created.
 */
type Outcome = 'completed' | 'aborted';

/** What the board draws for the gesture in progress. Changes only when the drawing does. */
export type GestureView =
  | { readonly kind: 'idle' }
  | { readonly kind: 'moving'; readonly overTrash: boolean }
  | { readonly kind: 'resizing' }
  | { readonly kind: 'creating'; readonly preview: Rect | null };

const IDLE_VIEW: GestureView = { kind: 'idle' };

/** Spread onto the board element. */
export interface BoardGestureHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: PointerEvent<HTMLElement>) => void;
}

/** What the board needs from the gesture: handlers to spread, what to draw, and the trash ref. */
export interface BoardGesture {
  readonly handlers: BoardGestureHandlers;
  readonly view: GestureView;
  /** Attach to the trash: its rect is read at each press, and presses on it start nothing. */
  readonly trashRef: RefObject<HTMLDivElement | null>;
}

/**
 * How far, in CSS pixels on either axis, a press on the empty board may move and still be a
 * click. It is the drag rectangle Windows itself uses to tell a click from a drag (SM_CXDRAG /
 * SM_CYDRAG): large enough to absorb hand jitter during a click, and far smaller than the
 * minimum note, so no one draws a rectangle that small on purpose. Once crossed, the press stays
 * a drag until release: a user who drags out and comes back near the start meant a drag, not a
 * click.
 */
const CLICK_SLOP = 4;

/** Spread onto a note's element so a press on it is classified as a press on that note. */
export function noteTargetProps(id: NoteId): { readonly 'data-note-id': NoteId } {
  return { 'data-note-id': id };
}

/** Spread onto a note's resize handle so a press on it resizes the note instead of moving it. */
export function resizeHandleProps(): { readonly 'data-resize-handle': true } {
  return { 'data-resize-handle': true };
}

type PressTarget =
  | { readonly kind: 'board' }
  | { readonly kind: 'note'; readonly note: Note }
  | { readonly kind: 'resizeHandle'; readonly note: Note }
  | { readonly kind: 'trash' };

/**
 * What a press landed on: the trash (a drop target, not a press target), a note's resize handle,
 * the note itself, or the empty board (also for an id no longer in `notes`).
 */
function classifyPress(
  target: EventTarget,
  notes: readonly Note[],
  trash: Element | null,
): PressTarget {
  if (!(target instanceof Element)) return { kind: 'board' };
  if (trash !== null && trash.contains(target)) return { kind: 'trash' };
  const raw = target.closest('[data-note-id]')?.getAttribute('data-note-id');
  const note = notes.find((candidate) => candidate.id === raw);
  if (note === undefined) return { kind: 'board' };
  if (target.closest('[data-resize-handle]') !== null) return { kind: 'resizeHandle', note };
  return { kind: 'note', note };
}

/** `element`'s rect in board coordinates, or null when it isn't rendered. */
function rectOnBoard(element: Element | null, boardOrigin: Point): Rect | null {
  if (element === null) return null;
  const box = element.getBoundingClientRect();
  return {
    x: box.left - boardOrigin.x,
    y: box.top - boardOrigin.y,
    width: box.width,
    height: box.height,
  };
}

/**
 * Owns the single pointer gesture of the whole board: classifies each primary-button press as a
 * note, a note's resize handle, the trash (ignored) or the empty board, and turns
 * press-drag-release into board actions: moving the note, resizing it, or creating a new one. A
 * move released with the pointer over the trash deletes the note.
 *
 * The pointer is captured on the board element, not on the pressed note:
 * - one element receives every event of the gesture, the same element whose handlers own it, so
 *   nothing depends on events bubbling up from a note;
 * - a gesture may outlive or precede its note (a note can be deleted on drop, or created by a
 *   gesture that starts where no note exists yet). When a captured node is removed, the browser
 *   sends `lostpointercapture` to the document, not to that node, so a gesture captured on a note
 *   could never learn that its capture ended. The board is never removed.
 *
 * The gesture lives in a ref, so pressing and moving don't render by themselves; only what the
 * hook dispatches does, except what the board draws for it (`GestureView`), which is state
 * because it is drawn.
 */
export function useBoardGesture(
  notes: readonly Note[],
  dispatch: Dispatch<BoardAction>,
  createNoteId: () => NoteId,
): BoardGesture {
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const trashRef = useRef<HTMLDivElement>(null);
  // The only gesture state that renders, because it is drawn; everything else stays in the ref.
  const [view, setView] = useState<GestureView>(IDLE_VIEW);

  /** The only place a gesture's effect is decided; every way of ending a gesture comes here. */
  const settle = (ended: ActiveGesture, outcome: Outcome): void => {
    gesture.current = { kind: 'idle' };
    setView(IDLE_VIEW);
    switch (ended.kind) {
      case 'moving': {
        if (outcome === 'completed' && ended.overTrash) {
          dispatch({ type: 'note/deleted', id: ended.noteId });
        }
        break;
      }
      case 'resizing': {
        break;
      }
      case 'creating': {
        if (outcome === 'completed') {
          dispatch({
            type: 'note/created',
            id: createNoteId(),
            rect: ended.draft ?? rectAt(ended.anchor, DEFAULT_NOTE_SIZE, ended.bounds),
          });
        }
        break;
      }
    }
  };

  /**
   * The only way a gesture ends, shared by pointerup, pointercancel and lostpointercapture:
   * - another pointer's up or cancel never ends this gesture, because the pointerId must match;
   * - lostpointercapture after pointerup is a no-op, because pointerup already went idle, so an
   *   end never happens twice;
   * - pointerup is the normal completion; pointercancel or lostpointercapture without a preceding
   *   pointerup is an abort;
   * - the outcome decides what the gesture leaves behind (see `Outcome`).
   */
  const endGesture = (
    event: PointerEvent<HTMLElement>,
    outcome: 'completed' | 'aborted',
  ): void => {
    const ended = gesture.current;
    if (ended.kind === 'idle' || event.pointerId !== ended.pointerId) return;
    settle(ended, outcome);
  };

  // Re-created on every render on purpose: they sit on the board, not on a memoized child, and
  // each render's handlers must see the latest `notes` so a second drag starts where the first ended.
  const handlers: BoardGestureHandlers = {
    onPointerDown: (event) => {
      // One gesture at a time: a second pointer (another finger, a pen) is ignored while one is
      // active.
      if (event.button !== 0 || gesture.current.kind !== 'idle') return;
      const pressed = classifyPress(event.target, notes, trashRef.current);
      // The trash is where notes are dropped, not something to press: a press on it starts no
      // gesture, so a click on the trash doesn't create a note under it.
      if (pressed.kind === 'trash') return;
      const board = event.currentTarget;
      // Capture before writing the gesture: if setPointerCapture throws (NotFoundError for an
      // inactive pointer), the gesture stays idle instead of stuck. Every press captures, the
      // empty board too, so a drag that leaves the window still ends.
      board.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      // Client coordinates equal board coordinates only because the board is
      // `position: fixed; inset: 0` (see Board.module.css). Moving only uses deltas, which are
      // the same in both systems. Creating and the trash test need absolute board positions, so
      // they convert here, by subtracting `boardOrigin` (the board's getBoundingClientRect()
      // left/top), not in the components or the domain.
      const origin = { x: event.clientX, y: event.clientY };
      const bounds = { width: board.clientWidth, height: board.clientHeight };
      const box = board.getBoundingClientRect();
      const boardOrigin = { x: box.left, y: box.top };
      switch (pressed.kind) {
        case 'board': {
          gesture.current = {
            kind: 'creating',
            pointerId,
            origin,
            boardOrigin,
            anchor: { x: origin.x - boardOrigin.x, y: origin.y - boardOrigin.y },
            bounds,
            draft: null,
          };
          setView({ kind: 'creating', preview: null });
          break;
        }
        case 'note': {
          const { note } = pressed;
          gesture.current = {
            kind: 'moving',
            pointerId,
            origin,
            noteId: note.id,
            startRect: note.rect,
            bounds,
            boardOrigin,
            trash: rectOnBoard(trashRef.current, boardOrigin),
            overTrash: false,
          };
          setView({ kind: 'moving', overTrash: false });
          dispatch({ type: 'note/broughtToFront', id: note.id });
          break;
        }
        case 'resizeHandle': {
          const { note } = pressed;
          gesture.current = {
            kind: 'resizing',
            pointerId,
            origin,
            noteId: note.id,
            startRect: note.rect,
            bounds,
          };
          setView({ kind: 'resizing' });
          // Any interaction with a note raises it, the handle as much as the body.
          dispatch({ type: 'note/broughtToFront', id: note.id });
          break;
        }
      }
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (current.kind === 'idle' || event.pointerId !== current.pointerId) return;
      const delta = { x: event.clientX - current.origin.x, y: event.clientY - current.origin.y };
      switch (current.kind) {
        case 'moving': {
          dispatch({
            type: 'note/moved',
            id: current.noteId,
            position: movedPosition(current.startRect, delta, current.bounds),
          });
          // The pointer, not the note, must be over the trash, so a large note can't be deleted
          // by grazing it.
          const pointer = {
            x: event.clientX - current.boardOrigin.x,
            y: event.clientY - current.boardOrigin.y,
          };
          const overTrash = current.trash !== null && containsPoint(current.trash, pointer);
          // Only a change re-renders the board: most moves stay on the same side of the trash's
          // edge.
          if (overTrash !== current.overTrash) {
            gesture.current = { ...current, overTrash };
            setView({ kind: 'moving', overTrash });
          }
          break;
        }
        case 'resizing': {
          dispatch({
            type: 'note/resized',
            id: current.noteId,
            size: resizedSize(current.startRect, delta, MIN_NOTE_SIZE, current.bounds),
          });
          break;
        }
        case 'creating': {
          // Still a click: the pointer has not yet left the slop around the press point.
          if (
            current.draft === null &&
            Math.abs(delta.x) <= CLICK_SLOP &&
            Math.abs(delta.y) <= CLICK_SLOP
          ) {
            return;
          }
          const draft = rectFromDrag(
            current.anchor,
            { x: event.clientX - current.boardOrigin.x, y: event.clientY - current.boardOrigin.y },
            MIN_NOTE_SIZE,
            current.bounds,
          );
          gesture.current = { ...current, draft };
          setView({ kind: 'creating', preview: draft });
          break;
        }
      }
    },
    onPointerUp: (event) => {
      endGesture(event, 'completed');
    },
    onPointerCancel: (event) => {
      endGesture(event, 'aborted');
    },
    onLostPointerCapture: (event) => {
      // The board captures the pointer, so its own lost capture targets the board itself. One
      // that bubbles up from a child says that child's capture ended, not the board's. Up and
      // cancel describe the pointer itself, whatever element they target, so they don't check.
      if (event.target !== event.currentTarget) return;
      endGesture(event, 'aborted');
    },
  };

  return { handlers, view, trashRef };
}
