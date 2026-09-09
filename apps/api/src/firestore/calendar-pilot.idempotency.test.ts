import { describe, expect, it } from 'vitest';

import { parsePilotIdempotencyRecord } from './calendar-pilot.repository.js';
import { ConflictError } from '../platform/errors/api-error.js';

describe('parsePilotIdempotencyRecord', () => {
  it('accepts a local idempotency envelope', () => {
    expect(
      parsePilotIdempotencyRecord({
        fingerprint: 'abc',
        response: { ok: true }
      })
    ).toEqual({
      fingerprint: 'abc',
      response: { ok: true }
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing fingerprint', { response: { ok: true } }],
    ['an empty fingerprint', { fingerprint: '', response: { ok: true } }],
    ['a missing response', { fingerprint: 'abc' }]
  ])('rejects %s', (_label, data) => {
    expect(() => parsePilotIdempotencyRecord(data)).toThrow(ConflictError);
  });
});
