import { describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  asApiClientError,
  createApiClient,
  httpTransportError
} from '../public/modules/api-client.js';
import { runPendingAction } from '../public/modules/async-action.js';

function fakeControl() {
  const attributes = new Map<string, string>();
  return {
    disabled: false,
    dataset: {} as Record<string, string>,
    textContent: '儲存',
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    attribute(name: string) {
      return attributes.get(name);
    }
  };
}

describe('browser API client seam', () => {
  it('delegates through the injected transport', async () => {
    const transport = vi.fn(() => Promise.resolve({ version: 2 }));
    const client = createApiClient(transport);

    await expect(client.request('/state')).resolves.toEqual({ version: 2 });
    expect(transport).toHaveBeenCalledWith('/state', {});
  });

  it('normalizes transport failures without losing safe metadata', () => {
    const source = Object.assign(new Error('服務暫時忙碌。'), {
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      correlationId: 'corr_test_001'
    });
    const error = asApiClientError(source);

    expect(error).toMatchObject({
      name: 'ApiClientError',
      message: '服務暫時忙碌。',
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      correlationId: 'corr_test_001'
    });
  });

  it('retries a retryable GET once but never automatically replays POST', async () => {
    const readTransport = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError('暫時失敗。', { retryable: true })
      )
      .mockResolvedValueOnce({ ok: true });
    const readClient = createApiClient(readTransport, { readRetries: 1 });

    await expect(readClient.request('/state')).resolves.toEqual({ ok: true });
    expect(readTransport).toHaveBeenCalledTimes(2);

    const writeTransport = vi.fn().mockRejectedValue(
      new ApiClientError('結果未知，必須由使用者重試。', {
        retryable: true
      })
    );
    const writeClient = createApiClient(writeTransport, { readRetries: 3 });

    await expect(
      writeClient.request('/bookings', { method: 'POST' })
    ).rejects.toMatchObject({ retryable: true });
    expect(writeTransport).toHaveBeenCalledTimes(1);
  });
});

describe('HTTP transport error mapping', () => {
  it('maps statuses to the v1 envelope with correct retryability', () => {
    expect(httpTransportError({ status: 409 })).toMatchObject({
      code: 'CONFLICT',
      retryable: false
    });
    expect(httpTransportError({ status: 429 })).toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true
    });
    expect(httpTransportError({ status: 503 })).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      retryable: true
    });
    expect(httpTransportError({ status: 400 })).toMatchObject({
      code: 'VALIDATION_FAILED',
      retryable: false
    });
  });

  it('prefers a parsed body code and keeps the message resource-free', () => {
    const error = httpTransportError({
      status: 409,
      code: 'IDEMPOTENCY_MISMATCH',
      correlationId: 'corr_x1'
    });
    expect(error.code).toBe('IDEMPOTENCY_MISMATCH');
    expect(error.correlationId).toBe('corr_x1');
    // A safe message never carries a long identifier.
    expect(error.message).not.toMatch(/[0-9]{6,}/);
  });

  it('auto-retries a 503 GET but surfaces a 503 POST for the user to retry', async () => {
    const readTransport = vi
      .fn()
      .mockRejectedValueOnce(httpTransportError({ status: 503 }))
      .mockResolvedValueOnce({ ok: true });
    const readClient = createApiClient(readTransport, { readRetries: 1 });
    await expect(readClient.request('/state')).resolves.toEqual({ ok: true });
    expect(readTransport).toHaveBeenCalledTimes(2);

    const writeTransport = vi
      .fn()
      .mockRejectedValue(httpTransportError({ status: 503 }));
    const writeClient = createApiClient(writeTransport);
    await expect(
      writeClient.request('/bookings', { method: 'POST' })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
    expect(writeTransport).toHaveBeenCalledTimes(1);
  });

  it('surfaces offline as a retryable failure without calling the transport', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    try {
      const transport = vi.fn();
      const client = createApiClient(transport, { readRetries: 0 });
      await expect(
        client.request('/bookings', { method: 'POST' })
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
      expect(transport).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('turns a hung transport into a retryable timeout', async () => {
    const transport = vi.fn(() => new Promise(() => {}));
    const client = createApiClient(transport, {
      readRetries: 0,
      timeoutMs: 10
    });
    await expect(
      client.request('/bookings', { method: 'POST' })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', retryable: true });
  });
});

describe('pending UI action', () => {
  it('disables and labels the control until the action settles', async () => {
    const control = fakeControl();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    const resultPromise = runPendingAction({
      control,
      pendingLabel: '儲存中…',
      action: () => pending
    });

    expect(control).toMatchObject({
      disabled: true,
      textContent: '儲存中…',
      dataset: { busy: 'true' }
    });
    expect(control.attribute('aria-busy')).toBe('true');

    release();
    await expect(resultPromise).resolves.toMatchObject({ ok: true });
    expect(control).toMatchObject({
      disabled: false,
      textContent: '儲存',
      dataset: {}
    });
    expect(control.attribute('aria-busy')).toBeUndefined();
  });

  it('offers explicit retry only when the client marks the failure retryable', async () => {
    const control = fakeControl();
    const retryableError = Object.assign(new Error('暫時失敗。'), {
      retryable: true
    });
    const retryable = await runPendingAction({
      control,
      action: () => Promise.reject(retryableError)
    });
    const denied = await runPendingAction({
      control,
      action: () => Promise.reject(new Error('不允許此操作。'))
    });

    expect(retryable).toMatchObject({
      ok: false,
      error: { retryable: true },
      retry: expect.any(Function)
    });
    expect(denied).toMatchObject({
      ok: false,
      error: { retryable: false }
    });
    expect(denied).not.toHaveProperty('retry');
  });
});
