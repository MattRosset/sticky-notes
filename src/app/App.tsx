import { useReducer } from 'react';
import { Board } from '../components/Board.tsx';
import { boardReducer } from '../domain/board.ts';
import { createSeedState } from './seedNotes.ts';

export function App() {
  const [state, dispatch] = useReducer(boardReducer, undefined, createSeedState);
  return <Board notes={state.notes} dispatch={dispatch} />;
}
