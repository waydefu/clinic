import {
  ApiErrorResponseSchema,
  type ApiErrorCode
} from '@beauessence/contracts';
import { DomainError } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  PolicyAcceptanceRequiredError,
  RateLimitedError,
  ServiceUnavailableError,
  mapErrorToApiResponse
} from './api-error.js';
import { MissingVerifiedPatientError } from '../../appointments/appointment.application-service.js';

const CORRELATION = 'corr_req_0001';

describe('mapErrorToApiResponse', () => {
  it('maps a Zod parse failure to 400 VALIDATION_FAILED', () => {
    const zodError = z.string().safeParse(123).error;
    const mapped = mapErrorToApiResponse(zodError, CORRELATION);
    expect(mapped.status).toBe(400);
    expect(mapped.body.error.code).toBe('VALIDATION_FAILED');
  });

  it.each<[string, ApiErrorCode, number]>([
    ['APPOINTMENT_NOT_FOUND', 'NOT_FOUND', 404],
    ['SLOT_UNAVAILABLE', 'CONFLICT', 409],
    ['IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_MISMATCH', 409],
    ['COMPLETION_NOT_AUTHORIZED', 'AUTHORIZATION_DENIED', 403],
    ['INVALID_VALUE', 'VALIDATION_FAILED', 400],
    ['PAYROLL_PERIOD_ALREADY_CLOSED', 'CONFLICT', 409],
    ['SCHEDULE_VERSION_CONFLICT', 'CONFLICT', 409]
  ])('maps DomainError %s to %s (%d)', (domainCode, apiCode, status) => {
    const mapped = mapErrorToApiResponse(
      new DomainError(domainCode as never, 'internal detail'),
      CORRELATION
    );
    expect(mapped.body.error.code).toBe(apiCode);
    expect(mapped.status).toBe(status);
  });

  it.each([
    [new AuthenticationRequiredError(), 'AUTHENTICATION_REQUIRED', 401],
    [new AuthorizationDeniedError(), 'AUTHORIZATION_DENIED', 403],
    [new PolicyAcceptanceRequiredError(), 'POLICY_ACCEPTANCE_REQUIRED', 428],
    [new RateLimitedError(), 'RATE_LIMITED', 429],
    [new ServiceUnavailableError(), 'SERVICE_UNAVAILABLE', 503]
  ] as const)('maps %s to its status', (error, apiCode, status) => {
    const mapped = mapErrorToApiResponse(error, CORRELATION);
    expect(mapped.body.error.code).toBe(apiCode);
    expect(mapped.status).toBe(status);
  });

  it('maps an unknown error to 500 INTERNAL_ERROR', () => {
    const mapped = mapErrorToApiResponse(new Error('boom'), CORRELATION);
    expect(mapped.status).toBe(500);
    expect(mapped.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('maps a missing verified patient identity to 401, not 500', () => {
    // 缺少已驗證的患者身分是呼叫端的狀態，不是伺服器故障。這個錯誤先前繼承的是
    // 一般 Error，於是落到「未知錯誤」那一支，回 500——對呼叫端毫無指引，還會
    // 把用戶端狀況算進伺服器錯誤率裡。
    const mapped = mapErrorToApiResponse(
      new MissingVerifiedPatientError(),
      CORRELATION
    );
    expect(mapped.status).toBe(401);
    expect(mapped.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('never leaks the domain message into the response body', () => {
    const mapped = mapErrorToApiResponse(
      new DomainError(
        'APPOINTMENT_NOT_FOUND',
        '找不到病患 王小明 的預約 appt_123'
      ),
      CORRELATION
    );
    expect(mapped.body.error.message).toBe('找不到指定的資料。');
    expect(mapped.body.error.message).not.toContain('王小明');
    expect(mapped.body.error.message).not.toContain('appt_123');
  });

  it('replaces a non-opaque correlation id rather than echoing it', () => {
    const mapped = mapErrorToApiResponse(
      new Error('x'),
      'user@example.com 0912-345-678'
    );
    expect(mapped.body.error.correlationId).toBe('unknown');
  });

  it('always produces a body that satisfies the v1 error envelope', () => {
    const errors: unknown[] = [
      z.string().safeParse(1).error,
      new DomainError('SLOT_UNAVAILABLE', 'x'),
      new AuthenticationRequiredError(),
      new RateLimitedError(),
      new Error('x')
    ];
    for (const error of errors) {
      const mapped = mapErrorToApiResponse(error, CORRELATION);
      expect(ApiErrorResponseSchema.safeParse(mapped.body).success).toBe(true);
    }
  });
});
