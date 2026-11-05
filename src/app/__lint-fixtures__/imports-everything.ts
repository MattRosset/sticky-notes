// Negative control: app/ is the composition root and may import every layer.
import { useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { boardReducer } from '../../domain/board';
import { usePointerGesture } from '../../interaction/usePointerGesture';
import { Note } from '../../components/Note';
import { localStorageRepository } from '../../persistence/localStorageRepository';

export const wiring = [
  useReducer,
  createRoot,
  boardReducer,
  usePointerGesture,
  Note,
  localStorageRepository,
];
