import type { Ref } from 'react';
import styles from './Trash.module.css';

/** rest: no note is moving. active: a note is moving. armed: releasing now deletes it. */
export type TrashState = 'rest' | 'active' | 'armed';

interface TrashProps {
  readonly state: TrashState;
  readonly ref: Ref<HTMLDivElement>;
}

/** Where notes are dropped to delete them. The board hit-tests it; it handles no input itself. */
export function Trash({ state, ref }: TrashProps) {
  return (
    <div
      ref={ref}
      className={styles.trash}
      role="img"
      aria-label="Trash"
      title="Drag a note here to delete it"
      data-state={state}
    >
      <svg
        viewBox="0 0 24 24"
        width="40"
        height="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13h10l1-13" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </div>
  );
}
