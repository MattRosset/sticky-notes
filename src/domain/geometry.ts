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
