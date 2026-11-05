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
