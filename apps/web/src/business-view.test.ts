import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  requestBusinessApi,
  requestFreshIdToken
} from '../public/modules/business-view.js';

function storage(csrf: string | null = 'csrf_test') {
  return {
    getItem: vi.fn((key: string) => (key === 'calPilotCsrf' ? csrf : null)),
    setItem: vi.fn(),
    removeItem: vi.fn()
  };
}

afterEach(() => vi.useRealTimers());

describe('requestFreshIdToken', () => {
  it('dispatches synchronously and ignores another request ID', async () => {
    const target = new EventTarget();
    let requestId = '';
    target.addEventListener('beauessence:reauth-request', (event) => {
      requestId = (event as CustomEvent<{ requestId: string }>).detail
        .requestId;
      target.dispatchEvent(
        new CustomEvent('beauessence:reauth-result', {
          detail: { requestId: 'unrelated', idToken: 'wrong-token' }
        })
      );
      target.dispatchEvent(
        new CustomEvent('beauessence:reauth-result', {
          detail: { requestId, idToken: 'synthetic-fresh-token' }
        })
      );
    });

    const pending = requestFreshIdToken({ target, timeoutMs: 100 });
    expect(requestId).not.toBe('');
    await expect(pending).resolves.toBe('synthetic-fresh-token');
  });

  it('returns a safe provider error for its correlated request', async () => {
    const target = new EventTarget();
    target.addEventListener('beauessence:reauth-request', (event) => {
      const { requestId } = (event as CustomEvent<{ requestId: string }>)
        .detail;
      target.dispatchEvent(
        new CustomEvent('beauessence:reauth-result', {
          detail: { requestId, error: '重新登入未完成' }
        })
      );
    });

    await expect(
      requestFreshIdToken({ target, timeoutMs: 100 })
    ).rejects.toThrow('重新登入未完成');
  });

  it('times out and cancels the provider request', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const cancelled: string[] = [];
    target.addEventListener('beauessence:reauth-cancel', (event) => {
      cancelled.push(
        (event as CustomEvent<{ requestId: string }>).detail.requestId
      );
    });

    const pending = requestFreshIdToken({ target, timeoutMs: 25 });
    const assertion = expect(pending).rejects.toThrow('重新登入逾時');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).not.toBe('');
  });

  it('cancels promptly when the caller aborts', async () => {
    const target = new EventTarget();
    const controller = new AbortController();
    const cancelled = vi.fn();
    target.addEventListener('beauessence:reauth-cancel', cancelled);
    const pending = requestFreshIdToken({
      target,
      signal: controller.signal,
      timeoutMs: 1000
    });

    controller.abort();
    await expect(pending).rejects.toThrow('重新登入已取消');
    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});

describe('requestBusinessApi', () => {
  it('never sends without the C1 CSRF session', async () => {
    const fetchImpl = vi.fn();
    await expect(
      requestBusinessApi('/v1/business-delivery/milestones', {
        storage: storage(null),
        fetchImpl
      })
    ).rejects.toThrow('此功能只在 C1 伺服器模式可用');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('passes caller cancellation to the same-origin request', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ accepted: true })
      })
    );
    await requestBusinessApi('/v1/business-delivery/milestones', {
      signal: controller.signal,
      storage: storage(),
      fetchImpl
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('sends same-origin CSRF and fresh-token headers without persisting the token', async () => {
    const session = storage();
    const fetchImpl = vi.fn((_path, options) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ accepted: true }),
        options
      })
    );
    const result = await requestBusinessApi('/v1/business-delivery/exports', {
      method: 'POST',
      body: { idempotencyKey: 'synthetic_key_1234567890', format: 'csv' },
      reauthToken: 'synthetic-fresh-id-token',
      storage: session,
      fetchImpl
    });

    expect(result).toEqual({ accepted: true });
    const options = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(options.credentials).toBe('same-origin');
    expect(headers['X-CSRF-Token']).toBe('csrf_test');
    expect(headers['x-reauth-id-token']).toBe('synthetic-fresh-id-token');
    expect(options.body).not.toContain('synthetic-fresh-id-token');
    expect(session.setItem).not.toHaveBeenCalled();
    expect(session.removeItem).not.toHaveBeenCalled();
  });

  it('preserves server denial messages and does not retry a write', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: '資料狀態已變更。' } })
      })
    );
    await expect(
      requestBusinessApi('/v1/business-delivery/retention/archive', {
        method: 'POST',
        body: { patientId: 'patient_test_001' },
        storage: storage(),
        fetchImpl
      })
    ).rejects.toThrow('資料狀態已變更。');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
