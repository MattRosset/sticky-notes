import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveScheduler } from './saveScheduler.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSaveScheduler', () => {
  it('saves the latest state once, after the delay', () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = createSaveScheduler<string>(save, 300, vi.fn());

    scheduler.schedule('a');
    vi.advanceTimersByTime(100);
    scheduler.schedule('b');
    vi.advanceTimersByTime(100);
    scheduler.schedule('c');
    vi.advanceTimersByTime(299);

    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('c');
  });

  it('each schedule restarts the wait', () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = createSaveScheduler<string>(save, 300, vi.fn());

    scheduler.schedule('a');
    vi.advanceTimersByTime(200);
    scheduler.schedule('b');
    vi.advanceTimersByTime(200);

    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
  });

  it('flush saves the waiting state at once and the timer no longer fires', () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = createSaveScheduler<string>(save, 300, vi.fn());

    scheduler.schedule('a');
    scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('a');

    vi.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing waiting saves nothing', () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = createSaveScheduler<string>(save, 300, vi.fn());

    scheduler.flush();
    scheduler.schedule('a');
    vi.advanceTimersByTime(300);
    scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failed save goes to onError', async () => {
    const error = new Error('quota');
    const save = vi.fn(() => Promise.reject(error));
    const onError = vi.fn();
    const scheduler = createSaveScheduler<string>(save, 300, onError);

    scheduler.schedule('a');
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
