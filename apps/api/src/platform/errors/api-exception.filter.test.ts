import type { StructuredLog } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import { InMemoryDeniedAccessAuditSink } from '../authorization/denied-access-audit.port.js';
import { InMemoryApiMetrics } from '../runtime/api-metrics.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  RateLimitedError,
  ServiceUnavailableError
} from './api-error.js';
import {
  ApiExceptionFilter,
  DENIED_AUDIT_APPEND_HEADER
} from './api-exception.filter.js';

interface CapturedReply {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  header(name: string, value: string): CapturedReply;
  status(code: number): CapturedReply;
  send(body: unknown): void;
}

function reply(): CapturedReply {
  return {
    statusCode: 0,
    body: undefined,
    headers: {},
    header(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
    }
  };
}

function host(
  captured: CapturedReply,
  request: {
    readonly method?: string;
    readonly routerPath?: string;
    readonly headers?: Record<string, unknown>;
    readonly authentication?: {
      readonly actorId?: string;
      readonly actorRole?: string;
    };
  }
) {
  return {
    switchToHttp: () => ({
      getResponse: () => captured,
      getRequest: () => request
    })
  } as never;
}

describe('ApiExceptionFilter denied-authorization audit lifecycle', () => {
  it('records one durable event for one denial and ignores client event ids', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const filter = new ApiExceptionFilter(denials);
    const captured = reply();
    await filter.catch(
      new AuthorizationDeniedError(),
      host(captured, {
        method: 'POST',
        routerPath: '/v1/bookings',
        headers: {
          'x-event-id': 'client_supplied_event',
          'event-id': 'also_client',
          authorization: 'Bearer password-token-totp',
          cookie: 'session=secret'
        },
        authentication: { actorId: 'staff_front_001', actorRole: 'front_desk' }
      })
    );
    expect(captured.statusCode).toBe(403);
    expect(captured.body).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' }
    });
    expect(captured.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('recorded');
    expect(denials.list()).toHaveLength(1);
    const event = denials.list()[0];
    expect(event?.eventId).toMatch(/^denial_[A-Za-z0-9_-]+$/);
    expect(event?.eventId).not.toBe('client_supplied_event');
    expect(event?.eventId).not.toBe('also_client');
    expect(event?.actorId).toBe('staff_front_001');
    expect(event?.outcome).toBe('denied');
    expect(JSON.stringify(event)).not.toMatch(
      /password|token|totp|cookie|Bearer|session=secret/i
    );
  });

  it('records two events for two requests', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const filter = new ApiExceptionFilter(denials);
    const first = reply();
    const second = reply();
    await filter.catch(
      new AuthenticationRequiredError(),
      host(first, { method: 'POST', routerPath: '/v1/bookings' })
    );
    await filter.catch(
      new AuthenticationRequiredError(),
      host(second, { method: 'POST', routerPath: '/v1/bookings' })
    );
    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(denials.list()).toHaveLength(2);
    expect(denials.list()[0]?.eventId).not.toBe(denials.list()[1]?.eventId);
    expect(denials.list()[0]?.correlationId).not.toBe(
      denials.list()[1]?.correlationId
    );
  });

  it('deduplicates the same denial object to one append', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const filter = new ApiExceptionFilter(denials);
    const error = new AuthorizationDeniedError();
    const first = reply();
    const second = reply();
    await filter.catch(
      error,
      host(first, { method: 'GET', routerPath: '/v1/bookings' })
    );
    await filter.catch(
      error,
      host(second, { method: 'GET', routerPath: '/v1/bookings' })
    );
    expect(first.statusCode).toBe(403);
    expect(second.statusCode).toBe(403);
    expect(first.body).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' }
    });
    expect(second.body).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' }
    });
    expect(denials.list()).toHaveLength(1);
    expect(second.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('duplicate');
  });

  it('keeps the denial HTTP status and body when append fails and exposes bounded evidence', async () => {
    const logs: StructuredLog[] = [];
    const metrics = new InMemoryApiMetrics(() => 1_000);
    const filter = new ApiExceptionFilter(
      {
        record: () => Promise.reject(new Error('storage unavailable'))
      },
      metrics,
      {
        emit(entry) {
          logs.push(entry);
        }
      }
    );
    const captured = reply();
    await filter.catch(
      new AuthorizationDeniedError(),
      host(captured, { method: 'POST', routerPath: '/v1/bookings' })
    );
    expect(captured.statusCode).toBe(403);
    expect(captured.body).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' }
    });
    expect(captured.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('failed');
    expect(
      logs.some(
        (entry) =>
          entry.operation === 'denied_access_audit' &&
          entry.result === 'error' &&
          entry.errorCode === 'INTERNAL_ERROR' &&
          entry.retryState === 'none'
      )
    ).toBe(true);
    expect(JSON.stringify(logs)).not.toMatch(
      /password|token|0912|storage unavailable/i
    );
    expect(
      metrics.firingAlerts({
        processAlive: true,
        firestore: 'ok',
        calendarAdapter: 'ok',
        requiredConfigPresent: true,
        bookingGateEnabled: true,
        outboxDeadLetterCount: 0,
        outboxOldestAgeSeconds: 0,
        candidateBacklog: 0,
        calendarSyncStale: false,
        calendarGoneRecoveryNeeded: false,
        backupFailed: false,
        iamAlertIntegrated: true,
        workerDegraded: false
      })
    ).toEqual([]);
  });

  it('does not emit a denial audit for successful or non-denial failures', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const filter = new ApiExceptionFilter(denials);
    const captured = reply();
    await filter.catch(
      new RateLimitedError(30),
      host(captured, { method: 'POST', routerPath: '/v1/bookings' })
    );
    expect(captured.statusCode).toBe(429);
    expect(captured.headers[DENIED_AUDIT_APPEND_HEADER]).toBeUndefined();
    expect(denials.list()).toHaveLength(0);
  });

  it('records calendar-session denials with a safe action label', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const filter = new ApiExceptionFilter(denials);
    const captured = reply();
    await filter.catch(
      new AuthenticationRequiredError(),
      host(captured, {
        method: 'POST',
        routerPath: '/v1/calendar-session'
      })
    );
    expect(captured.statusCode).toBe(401);
    expect(captured.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('recorded');
    expect(denials.list()).toHaveLength(1);
    expect(denials.list()[0]?.action).not.toMatch(/session|token|cookie/i);
  });
});

describe('ApiExceptionFilter structured log operations (B-06)', () => {
  async function emitStructuredLog(
    error: unknown,
    request: { readonly method?: string; readonly routerPath?: string }
  ): Promise<StructuredLog[]> {
    const logs: StructuredLog[] = [];
    const filter = new ApiExceptionFilter(undefined, undefined, {
      emit(entry) {
        logs.push(entry);
      }
    });
    await filter.catch(error, host(reply(), request));
    return logs;
  }

  it('emits POST_v1_bookings operation on POST failure', async () => {
    const logs = await emitStructuredLog(new Error('db fail'), {
      method: 'POST',
      routerPath: '/v1/bookings'
    });
    expect(logs).toEqual([
      expect.objectContaining({
        operation: 'POST_v1_bookings',
        result: 'error',
        errorCode: 'INTERNAL_ERROR'
      })
    ]);
  });

  it('emits POST_v1_bookings for SERVICE_UNAVAILABLE on POST', async () => {
    const logs = await emitStructuredLog(new ServiceUnavailableError(), {
      method: 'POST',
      routerPath: '/v1/bookings'
    });
    expect(logs).toEqual([
      expect.objectContaining({
        operation: 'POST_v1_bookings',
        result: 'error',
        errorCode: 'SERVICE_UNAVAILABLE'
      })
    ]);
  });

  it('keeps GET_v1_bookings distinct from POST_v1_bookings', async () => {
    const logs = await emitStructuredLog(new Error('db fail'), {
      method: 'GET',
      routerPath: '/v1/bookings'
    });
    expect(logs).toEqual([
      expect.objectContaining({
        operation: 'GET_v1_bookings',
        result: 'error',
        errorCode: 'INTERNAL_ERROR'
      })
    ]);
  });

  it('falls back cleanly when route or method is missing', async () => {
    const unknownLogs = await emitStructuredLog(new Error('bad route'), {
      method: 'POST'
    });
    const methodlessLogs = await emitStructuredLog(new Error('missing verb'), {
      routerPath: '/v1/bookings'
    });
    expect(unknownLogs[0]?.operation).toBe('unknown');
    expect(methodlessLogs[0]?.operation).toBe('v1_bookings');
  });
});
