import { expect, test, type Page } from '@playwright/test';
import {
  board,
  closeEditor,
  createByClick,
  drag,
  editor,
  notesNow,
  openBoard,
  trash,
  waitForBoard,
} from './board.ts';

async function rectOfNoteWithText(page: Page, text: string) {
  const notes = await notesNow(page);
  return notes.find((note) => note.text === text)?.rect ?? null;
}

function selectionText(page: Page): Promise<string | null> {
  return page.evaluate(() => getSelection()?.toString() ?? null);
}

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test('a click on the empty board creates a note there, ready for typing', async ({ page }) => {
  await createByClick(page, 300, 200);

  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 300, y: 200, width: 200, height: 150 }, z: 1, text: '' }]);
  await expect(editor(page)).toBeFocused();
});

test('dragging on the empty board draws a note of that size', async ({ page }) => {
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 10 });
  await expect(page.getByTestId('creation-preview')).toBeVisible();

  await page.mouse.up();
  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 100, y: 100, width: 300, height: 200 } }]);
  await expect(page.getByTestId('creation-preview')).toHaveCount(0);
});

test('dragging a note moves it and brings it to the front', async ({ page }) => {
  await createByClick(page, 200, 200);
  await closeEditor(page);

  await drag(page, { x: 300, y: 275 }, { x: 450, y: 355 });

  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 350, y: 280, width: 200, height: 150 }, z: 2 }]);
});

test('dragging the corner handle resizes the note', async ({ page }) => {
  await createByClick(page, 200, 200);
  await closeEditor(page);

  await drag(page, { x: 392, y: 342 }, { x: 452, y: 382 });

  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 200, y: 200, width: 260, height: 190 } }]);
});

test('dropping a note on the trash deletes it', async ({ page }) => {
  await createByClick(page, 200, 200);
  await closeEditor(page);

  await page.mouse.move(300, 275);
  await page.mouse.down();
  await page.mouse.move(952, 696, { steps: 15 });
  await expect(trash(page)).toHaveAttribute('data-state', 'armed');

  await page.mouse.up();
  await expect.poll(() => notesNow(page)).toEqual([]);
  await expect(page.getByText('Click anywhere to add a note, or drag to draw one.')).toBeVisible();
});

test('Escape during a move puts the note back', async ({ page }) => {
  await createByClick(page, 200, 200);
  await closeEditor(page);

  await page.mouse.move(300, 275);
  await page.mouse.down();
  await page.mouse.move(450, 355, { steps: 10 });
  await expect.poll(async () => (await notesNow(page))[0]?.rect.x).toBe(350);

  await page.keyboard.press('Escape');
  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 200, y: 200, width: 200, height: 150 } }]);
  await expect(board(page)).toHaveAttribute('data-gesture', 'idle');

  await page.mouse.up();
  await expect.poll(() => notesNow(page)).toMatchObject([{ rect: { x: 200, y: 200 } }]);
});

test('text is typed with the keyboard and Escape leaves the editor', async ({ page }) => {
  await createByClick(page, 300, 200);
  await page.keyboard.type('Buy milk');
  await expect.poll(() => notesNow(page)).toMatchObject([{ text: 'Buy milk' }]);

  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByText('Buy milk')).toBeVisible();

  await page.mouse.dblclick(350, 260);
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toHaveValue('Buy milk');
  await page.keyboard.type(' now');
  await expect.poll(() => notesNow(page)).toMatchObject([{ text: 'Buy milk now' }]);

  await page.mouse.click(700, 500);
  await expect(editor(page)).toHaveCount(0);
  await expect.poll(async () => (await notesNow(page)).length).toBe(1);
});

test('dragging inside the editor selects text and does not move the note', async ({ page }) => {
  await createByClick(page, 200, 200);
  await page.keyboard.type('First note text');
  const box = await editor(page).boundingBox();
  if (box === null) throw new Error('editor has no bounding box');

  await page.mouse.move(box.x + 1, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 8, { steps: 10 });
  await expect(board(page)).toHaveAttribute('data-gesture', 'idle');

  await page.mouse.up();
  // Without the editor guard, the press starts a move and closes the editor.
  await expect(editor(page)).toBeFocused();
  await expect
    .poll(() =>
      editor(page).evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement)) throw new Error('editor is not a textarea');
        return [element.selectionStart, element.selectionEnd];
      }),
    )
    .toEqual([0, 15]);
  await expect
    .poll(() => notesNow(page))
    .toMatchObject([{ rect: { x: 200, y: 200, width: 200, height: 150 } }]);
});

test('dragging a note across text selects nothing', async ({ page }) => {
  await createByClick(page, 100, 100);
  await page.keyboard.type('First note text');
  await closeEditor(page);
  await createByClick(page, 500, 120);
  await page.keyboard.type('Second note text');
  await closeEditor(page);

  await page.mouse.move(130, 125);
  await page.mouse.down();
  await page.mouse.move(400, 160, { steps: 15 });
  await expect(board(page)).toHaveAttribute('data-gesture', 'moving');
  await expect.poll(() => selectionText(page)).toBe('');

  await page.mouse.move(600, 300, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => selectionText(page)).toBe('');
  await expect
    .poll(() => rectOfNoteWithText(page, 'First note text'))
    .toEqual({ x: 570, y: 275, width: 200, height: 150 });
});

test('a reload right after a change keeps every note', async ({ page }) => {
  await createByClick(page, 100, 100);
  await page.keyboard.type('Keep me');
  await closeEditor(page);
  await drag(page, { x: 400, y: 300 }, { x: 700, y: 500 });
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type('Me too');
  await closeEditor(page);
  await drag(page, { x: 150, y: 175 }, { x: 200, y: 225 });
  await expect.poll(async () => (await notesNow(page))[0]?.rect.x).toBe(150);
  const before = await notesNow(page);

  // No wait: the save after the last move is still pending, so only the pagehide flush can have
  // written it.
  await page.reload();
  await waitForBoard(page);

  await expect.poll(() => notesNow(page)).toEqual(before);
  await expect(editor(page)).toHaveCount(0);
});
