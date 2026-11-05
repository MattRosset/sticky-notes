import { useReducer } from 'react';
import { Board } from '../components/Board.tsx';
import { boardReducer, initialBoardState } from '../domain/board.ts';
import { newNoteId } from './newNoteId.ts';

export function App() {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  return <Board notes={state.notes} dispatch={dispatch} createNoteId={newNoteId} />;
}
