import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { parsePilotIdempotencyRecord } from './calendar-pilot.repository.js';
import { ConflictError } from '../platform/errors/api-error.js';

const responseSchema = z.object({ ok: z.literal(true) }).strict();

describe('parsePilotIdempotencyRecord', () => {
  it('accepts a local idempotency envelope', () => {
    expect(
      parsePilotIdempotencyRecord(
        {
          fingerprint: 'abc',
          response: { ok: true }
        },
        responseSchema
      )
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
    expect(() => parsePilotIdempotencyRecord(data, responseSchema)).toThrow(
      ConflictError
    );
  });

  it('rejects a malformed replay response instead of trusting a generic cast', () => {
    expect(() =>
      parsePilotIdempotencyRecord(
        { fingerprint: 'abc', response: { ok: 'true' } },
        responseSchema
      )
    ).toThrow('Unreadable CAL-PILOT record.');
  });
});
