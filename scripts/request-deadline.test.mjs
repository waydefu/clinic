import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REQUEST_TIMEOUT_MS,
  withRequestDeadline
} from './request-deadline.mjs';

describe('withRequestDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('preserves the successful result identity and clears its timer', async () => {
    const value = { ok: true };
    let signal;
    const operation = vi.fn((requestSignal) => {
      signal = requestSignal;
      return value;
    });

    await expect(withRequestDeadline(operation)).resolves.toBe(value);
    expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(signal.aborted).toBe(false);
  });

  it('passes through the original rejection without retrying', async () => {
    const failure = new Error('operation failed');
    const operation = vi.fn(() => Promise.reject(failure));

    await expect(withRequestDeadline(operation)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects exactly at the deadline when the callback ignores abort', async () => {
    let signal;
    const operation = vi.fn((requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    });
    const result = withRequestDeadline(operation);
    const timeoutRejection = expect(result).rejects.toMatchObject({
      message: 'Request timed out.'
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await timeoutRejection;
    expect(signal.aborted).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a callback resolving after the deadline revive the result', async () => {
    const value = { ok: true };
    let signal;
    let resolveOperation;
    const operation = vi.fn((requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => {
        resolveOperation = resolve;
      });
    });
    const result = withRequestDeadline(operation);
    const timeoutRejection = expect(result).rejects.toMatchObject({
      message: 'Request timed out.'
    });

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await timeoutRejection;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    resolveOperation(value);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).rejects.toMatchObject({
      message: 'Request timed out.'
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
