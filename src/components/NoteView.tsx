import { memo, Profiler, type Dispatch } from 'react';
import type { BoardAction } from '../domain/board.ts';
import { clampPosition, type Rect, type Size } from '../domain/geometry.ts';
import type { Note } from '../domain/note.ts';
import { usePointerDrag } from '../interaction/usePointerDrag.ts';
import styles from './NoteView.module.css';
import { onNoteRender } from './renderProbe.ts';

interface NoteViewProps {
  readonly note: Note;
  readonly dispatch: Dispatch<BoardAction>;
  /** Board size in CSS pixels, read at press time (not during render). */
  readonly getBounds: () => Size;
}

function NoteViewImpl({ note, dispatch, getBounds }: NoteViewProps) {
  const handlers = usePointerDrag<{ readonly rect: Rect; readonly bounds: Size }>({
    onStart: () => {
      dispatch({ type: 'note/broughtToFront', id: note.id });
      return { rect: note.rect, bounds: getBounds() };
    },
    onMove: (start, delta) => {
      // The rect at press time plus the offset from the press point, kept fully on the board.
      const position = clampPosition(
        { x: start.rect.x + delta.x, y: start.rect.y + delta.y },
        start.rect,
        start.bounds,
      );
      dispatch({ type: 'note/moved', id: note.id, position });
    },
  });

  const { x, y, width, height } = note.rect;
  return (
    <Profiler id={note.id} onRender={onNoteRender}>
      <article
        className={styles.note}
        aria-label="Sticky note"
        {...handlers}
        style={{
          transform: `translate(${String(x)}px, ${String(y)}px)`,
          width,
          height,
          zIndex: note.z,
        }}
      />
    </Profiler>
  );
}

/**
 * Default prop comparison: the reducer keeps unchanged notes by identity and the board passes a
 * stable `dispatch` and `getBounds`, so only the note that changed re-renders.
 */
export const NoteView = memo(NoteViewImpl);
