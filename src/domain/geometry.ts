export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Board coordinates in CSS pixels, origin at the board's top-left corner. */
export interface Rect extends Point, Size {}

/**
 * Returns the position closest to `position` that keeps a box of `size` fully inside `bounds`
 * (whose origin is 0,0). A box larger than `bounds` is pinned to 0 on that axis.
 */
export function clampPosition(position: Point, size: Size, bounds: Size): Point {
  return {
    x: Math.min(Math.max(position.x, 0), Math.max(bounds.width - size.width, 0)),
    y: Math.min(Math.max(position.y, 0), Math.max(bounds.height - size.height, 0)),
  };
}

/** Where a note dragged by `delta` from its rect at press time lands, kept fully inside `bounds`. */
export function movedPosition(start: Rect, delta: Point, bounds: Size): Point {
  return clampPosition({ x: start.x + delta.x, y: start.y + delta.y }, start, bounds);
}

/** `point` moved onto the nearest point of the box (0,0)–(bounds). */
export function clampPoint(point: Point, bounds: Size): Point {
  return {
    x: Math.min(Math.max(point.x, 0), bounds.width),
    y: Math.min(Math.max(point.y, 0), bounds.height),
  };
}

/** A box of `size` at `position`, shifted to lie fully inside `bounds` (see clampPosition). */
export function rectAt(position: Point, size: Size, bounds: Size): Rect {
  return { ...clampPosition(position, size, bounds), ...size };
}

/**
 * One axis of a dragged rect: spans `anchor`→`pointer`, grown to `min` from the anchor in the
 * drag direction (positive when the two are equal).
 */
function dragSpan(anchor: number, pointer: number, min: number): { start: number; length: number } {
  const delta = pointer - anchor;
  const length = Math.max(Math.abs(delta), min);
  return { start: delta < 0 ? anchor - length : anchor, length };
}

/**
 * The rect dragged out from `anchor` (the press point) to `pointer`, in board coordinates:
 * both points clamped into `bounds`; spans anchor→pointer on each axis, so dragging up or left
 * works; an axis shorter than `minSize` grows from the anchor in the drag direction (positive
 * when the axis has zero length); then shifted, never shrunk, to lie fully inside `bounds`.
 */
export function rectFromDrag(anchor: Point, pointer: Point, minSize: Size, bounds: Size): Rect {
  const a = clampPoint(anchor, bounds);
  const p = clampPoint(pointer, bounds);
  const x = dragSpan(a.x, p.x, minSize.width);
  const y = dragSpan(a.y, p.y, minSize.height);
  return rectAt({ x: x.start, y: y.start }, { width: x.length, height: y.length }, bounds);
}

/**
 * The size of a note resized from its bottom-right corner by `delta` from its rect at press
 * time: at least `minSize`, and not past the right/bottom edge of `bounds` (the minimum wins when
 * they conflict).
 */
export function resizedSize(start: Rect, delta: Point, minSize: Size, bounds: Size): Size {
  return {
    width: Math.max(minSize.width, Math.min(start.width + delta.x, bounds.width - start.x)),
    height: Math.max(minSize.height, Math.min(start.height + delta.y, bounds.height - start.y)),
  };
}
