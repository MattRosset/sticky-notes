import { describe, expect, it } from 'vitest';
import { clampPosition, movedPosition, type Rect, type Size } from './geometry.ts';

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
