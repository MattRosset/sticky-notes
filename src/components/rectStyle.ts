import type { CSSProperties } from 'react';
import type { Rect } from '../domain/geometry.ts';

/** Places an absolutely positioned box at `rect` (board coordinates). */
export function rectStyle({ x, y, width, height }: Rect): CSSProperties {
  return { transform: `translate(${String(x)}px, ${String(y)}px)`, width, height };
}
