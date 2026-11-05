import { describe, expect, it } from 'vitest';
import { subscribeNoteRenders } from './renderProbe.ts';

const noop = (): void => undefined;

describe('subscribeNoteRenders', () => {
  it('refuses a second subscriber until the first unsubscribes', () => {
    const unsubscribe = subscribeNoteRenders(noop);
    expect(() => subscribeNoteRenders(noop)).toThrow('A note render listener is already subscribed');
    unsubscribe();

    const unsubscribeAgain = subscribeNoteRenders(noop);
    unsubscribeAgain();
  });
});
