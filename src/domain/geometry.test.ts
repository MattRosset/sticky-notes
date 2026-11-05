import { describe, expect, it } from 'vitest';
import {
  clampPoint,
  clampPosition,
  containsPoint,
  movedPosition,
  rectAt,
  rectFromDrag,
  resizedSize,
  type Rect,
  type Size,
} from './geometry.ts';

const bounds: Size = { width: 1024, height: 768 };
const size: Size = { width: 200, height: 150 };

describe('clampPosition', () => {
  it('returns a position that is already inside unchanged', () => {
    expect(clampPosition({ x: 100, y: 50 }, size, bounds)).toEqual({ x: 100, y: 50 });
  });

  it('pins each edge', () => {
    expect(clampPosition({ x: -30, y: 10 }, size, bounds).x).toBe(0);
    expect(clampPosition({ x: 900, y: 10 }, size, bounds).x).toBe(824);
    expect(clampPosition({ x: 10, y: -5 }, size, bounds).y).toBe(0);
    expect(clampPosition({ x: 10, y: 700 }, size, bounds).y).toBe(618);
  });

  it('pins to 0 when the box is larger than the bounds', () => {
    expect(clampPosition({ x: 50, y: 50 }, { width: 2000, height: 1000 }, bounds)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('movedPosition', () => {
  const start: Rect = { x: 100, y: 50, width: 200, height: 150 };

  it('adds the delta to the start position', () => {
    expect(movedPosition(start, { x: 30, y: -20 }, bounds)).toEqual({ x: 130, y: 30 });
  });

  it('clamps the result inside the bounds', () => {
    expect(movedPosition(start, { x: 2000, y: -500 }, bounds)).toEqual({ x: 824, y: 0 });
  });
});

const min: Size = { width: 80, height: 60 };

describe('clampPoint', () => {
  it('keeps a point inside and pins one outside', () => {
    expect(clampPoint({ x: 100, y: 50 }, bounds)).toEqual({ x: 100, y: 50 });
    expect(clampPoint({ x: -10, y: 900 }, bounds)).toEqual({ x: 0, y: 768 });
    expect(clampPoint({ x: 2000, y: -1 }, bounds)).toEqual({ x: 1024, y: 0 });
  });
});

describe('rectAt', () => {
  it('places the size at the position, inside the bounds', () => {
    expect(rectAt({ x: 10, y: 20 }, { width: 200, height: 150 }, bounds)).toEqual({
      x: 10,
      y: 20,
      width: 200,
      height: 150,
    });
    expect(rectAt({ x: 950, y: 700 }, { width: 200, height: 150 }, bounds)).toEqual({
      x: 824,
      y: 618,
      width: 200,
      height: 150,
    });
  });
});

describe('rectFromDrag', () => {
  it('spans a down-right drag', () => {
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 300, y: 250 }, min, bounds)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });
  });

  it('normalizes an up-left drag', () => {
    expect(rectFromDrag({ x: 300, y: 250 }, { x: 100, y: 100 }, min, bounds)).toEqual({
      x: 100,
      y: 100,
      width: 200,
      height: 150,
    });
  });

  it('grows a short axis from the anchor in the drag direction', () => {
    expect(rectFromDrag({ x: 300, y: 250 }, { x: 290, y: 245 }, min, bounds)).toEqual({
      x: 220,
      y: 190,
      width: 80,
      height: 60,
    });
    expect(rectFromDrag({ x: 300, y: 250 }, { x: 310, y: 255 }, min, bounds)).toEqual({
      x: 300,
      y: 250,
      width: 80,
      height: 60,
    });
  });

  it('grows a zero-length drag down-right', () => {
    expect(rectFromDrag({ x: 300, y: 250 }, { x: 300, y: 250 }, min, bounds)).toEqual({
      x: 300,
      y: 250,
      width: 80,
      height: 60,
    });
  });

  it('clamps the pointer to the bounds', () => {
    expect(rectFromDrag({ x: 900, y: 700 }, { x: 5000, y: 5000 }, min, bounds)).toEqual({
      x: 900,
      y: 700,
      width: 124,
      height: 68,
    });
  });

  it('shifts a grown rect back inside the bounds', () => {
    expect(rectFromDrag({ x: 1000, y: 750 }, { x: 1010, y: 760 }, min, bounds)).toEqual({
      x: 944,
      y: 708,
      width: 80,
      height: 60,
    });
  });
});

describe('resizedSize', () => {
  const start: Rect = { x: 100, y: 50, width: 200, height: 150 };

  it('adds the delta to the start size', () => {
    expect(resizedSize(start, { x: 30, y: -20 }, min, bounds)).toEqual({ width: 230, height: 130 });
  });

  it('keeps the minimum size', () => {
    expect(resizedSize(start, { x: -500, y: -500 }, min, bounds)).toEqual({ width: 80, height: 60 });
  });

  it("stops at the bounds' right and bottom edges", () => {
    expect(resizedSize(start, { x: 5000, y: 5000 }, min, bounds)).toEqual({
      width: 924,
      height: 718,
    });
  });
});

describe('containsPoint', () => {
  const box: Rect = { x: 10, y: 20, width: 100, height: 80 };

  it('contains a point inside', () => {
    expect(containsPoint(box, { x: 50, y: 50 })).toBe(true);
    expect(containsPoint(box, { x: 109.5, y: 99.5 })).toBe(true);
  });

  it('includes the left and top edges and excludes the right and bottom ones', () => {
    expect(containsPoint(box, { x: 10, y: 20 })).toBe(true);
    expect(containsPoint(box, { x: 110, y: 50 })).toBe(false);
    expect(containsPoint(box, { x: 50, y: 100 })).toBe(false);
  });

  it('excludes a point outside', () => {
    expect(containsPoint(box, { x: 5, y: 50 })).toBe(false);
    expect(containsPoint(box, { x: 50, y: 200 })).toBe(false);
  });
});
