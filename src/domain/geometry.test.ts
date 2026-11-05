import { describe, expect, it } from 'vitest';
import { clampPosition, type Size } from './geometry.ts';

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
