import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  SMOKE_USAGE,
  assertInternalTestSmokeTarget,
  evaluateInternalTestBookingSmoke,
  evaluateUnauthenticatedApiSurface,
  evaluateUnauthenticatedBookingWrite,
  runInternalTestBookingSmokeCli,
  smokeInternalTestBooking
} from './internal-test-booking-smoke.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PREVIEW =
  'https://beauessence-clinic-stg-c1a01--internal-preproduction.web.app/';

describe('assertInternalTestSmokeTarget', () => {
  it('refuses the forbidden staging host and earlier synthetic-review packets', () => {
    expect(() =>
      assertInternalTestSmokeTarget(
        'https://beauessence-clinic-staging.web.app/'
      )
    ).toThrow(/beauessence-clinic-staging/);
    expect(() =>
      assertInternalTestSmokeTarget(
        'https://beauessence-clinic-staging--synthetic-review.web.app/'
      )
    ).toThrow(/beauessence-clinic-staging/);
  });

  it('refuses the isolated live channel and non-preview hosts', () => {
    expect(() =>
      assertInternalTestSmokeTarget(
        'https://beauessence-clinic-stg-c1a01.web.app/'
      )
    ).toThrow(/live channel/);
    expect(() =>
      assertInternalTestSmokeTarget(
        'https://cal-pilot-api-abc-an.a.run.app/v1/bookings'
      )
    ).toThrow(/live channel/);
    expect(() =>
      assertInternalTestSmokeTarget(
        'http://beauessence-clinic-stg-c1a01--x.web.app/'
      )
    ).toThrow(/https without credentials/);
  });

  it('accepts an isolated preview channel host', () => {
    const url = assertInternalTestSmokeTarget(PREVIEW);
    expect(url.hostname).toBe(
      'beauessence-clinic-stg-c1a01--internal-preproduction.web.app'
    );
  });
});

describe('evaluateUnauthenticatedApiSurface', () => {
  it('treats 503, 401, and static 404 as fail-closed and 2xx as a public write', () => {
    expect(evaluateUnauthenticatedBookingWrite({ status: 503 })).toEqual({
      ok: true,
      status: 503,
      reason: 'fail-closed'
    });
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'GET',
        path: '/v1/slots',
        status: 401
      })
    ).toMatchObject({ ok: true, status: 401 });
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 404
      })
    ).toMatchObject({ ok: true, status: 404 });
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 201
      }).reason
    ).toMatch(/production default is not OFF/);
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'GET',
        path: '/v1/slots',
        status: 200
      }).ok
    ).toBe(false);
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'GET',
        path: '/v1/slots',
        status: 500
      }).reason
    ).toMatch(/unexpected status 500/);
  });
});

describe('evaluateInternalTestBookingSmoke', () => {
  it('passes when both booking and slots stay fail-closed', () => {
    expect(
      evaluateInternalTestBookingSmoke({
        bookingWriteStatus: 503,
        slotsStatus: 503
      })
    ).toEqual({ ok: true, issues: [] });
    expect(
      evaluateInternalTestBookingSmoke({
        bookingWriteStatus: 404,
        slotsStatus: 404
      })
    ).toEqual({ ok: true, issues: [] });
  });

  it('fails if an unauthenticated create or slots list succeeds', () => {
    const created = evaluateInternalTestBookingSmoke({
      bookingWriteStatus: 201,
      slotsStatus: 503
    });
    expect(created.ok).toBe(false);
    expect(created.issues.join('\n')).toMatch(/POST \/v1\/bookings/);
    const listed = evaluateInternalTestBookingSmoke({
      bookingWriteStatus: 503,
      slotsStatus: 200
    });
    expect(listed.ok).toBe(false);
    expect(listed.issues.join('\n')).toMatch(/GET \/v1\/slots/);
  });
});

describe('smokeInternalTestBooking', () => {
  it('posts a contract body and does not treat a 2xx create as a pass', async () => {
    const fetchImpl = vi.fn((url, init) => {
      const path = String(url);
      if (path.endsWith('/v1/bookings') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).not.toHaveProperty('patient');
        expect(body).not.toHaveProperty('nationalId');
        expect(body).not.toHaveProperty('privacyAcceptance');
        return Promise.resolve({ status: 503 });
      }
      return Promise.resolve({ status: 503 });
    });
    await expect(smokeInternalTestBooking(PREVIEW, fetchImpl)).resolves.toEqual(
      { ok: true, issues: [] }
    );
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('does not fetch when the host is the live channel', async () => {
    const fetchImpl = vi.fn();
    await expect(
      smokeInternalTestBooking(
        'https://beauessence-clinic-stg-c1a01.web.app/',
        fetchImpl
      )
    ).rejects.toThrow(/live channel/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('runInternalTestBookingSmokeCli', () => {
  it('exits 2 without fetching when no preview URL is given', async () => {
    const fetchImpl = vi.fn();
    let stderr = '';
    const code = await runInternalTestBookingSmokeCli({
      argv: [],
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      },
      fetchImpl
    });
    expect(code).toBe(2);
    expect(stderr).toBe(SMOKE_USAGE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exits 1 when an unauthenticated create returns 2xx', async () => {
    const fetchImpl = vi.fn((url) => {
      if (String(url).endsWith('/v1/bookings')) {
        return Promise.resolve({ status: 201 });
      }
      return Promise.resolve({ status: 503 });
    });
    let stderr = '';
    const code = await runInternalTestBookingSmokeCli({
      argv: [PREVIEW],
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      },
      fetchImpl
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/production default is not OFF/);
  });
});

describe('internal-test booking smoke source', () => {
  it('does not deploy, apply, or mint a CI login token', () => {
    const source = readFileSync(
      join(root, 'scripts/internal-test-booking-smoke.mjs'),
      'utf8'
    );
    expect(source).not.toMatch(/hosting:channel:deploy/);
    expect(source).not.toMatch(/firebase deploy/);
    expect(source).not.toMatch(/login:ci/);
    expect(source).not.toMatch(/terraform apply/);
  });
});
