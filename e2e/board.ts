import { expect, type Locator, type Page } from '@playwright/test';
import type { BoardReadSeam } from '../src/app/testSeam.ts';
import type { Point } from '../src/domain/geometry.ts';
import type { Note } from '../src/domain/note.ts';

export function board(page: Page): Locator {
  return page.getByRole('main', { name: 'Sticky notes board' });
}

export function editor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Note text' });
}

export function trash(page: Page): Locator {
  return page.getByRole('img', { name: 'Trash' });
}

/** The notes as the app's reducer holds them, or null before the board has loaded. */
export function readNotes(page: Page): Promise<ReturnType<BoardReadSeam['notes']> | null> {
  return page.evaluate(() => window.__stickyNotes?.notes() ?? null);
}

export async function notesNow(page: Page): Promise<readonly Note[]> {
  const notes = await readNotes(page);
  if (notes === null) throw new Error('read seam missing');
  return notes;
}

/** Waits until the board is shown and its saved state has loaded. */
export async function waitForBoard(page: Page): Promise<void> {
  await expect(board(page)).toBeVisible();
  await expect.poll(() => readNotes(page)).not.toBeNull();
}

export async function openBoard(page: Page): Promise<void> {
  await page.goto('/');
  await waitForBoard(page);
}

export async function drag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** A click on the empty board creates a note, which opens in the editor. */
export async function createByClick(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y);
  await expect(editor(page)).toBeFocused();
}

export async function closeEditor(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
}
