import { useState } from 'react';
import { createLocalStorageRepository } from '../persistence/localStorageRepository.ts';
import { newNoteId } from './newNoteId.ts';
import { NotesApp } from './NotesApp.tsx';

export function App() {
  // The composition root is the one place that knows the board is kept in localStorage.
  const [repository] = useState(() => createLocalStorageRepository(() => window.localStorage));
  return <NotesApp repository={repository} createNoteId={newNoteId} />;
}
