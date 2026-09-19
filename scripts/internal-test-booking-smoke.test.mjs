import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  EXPECT_API_CANONICAL_SCHEDULE,
  INTERNAL_TEST_SMOKE_PROBES,
  SMOKE_APPOINTMENT_ID,
  SMOKE_USAGE,
  assertInternalTestSmokeTarget,
  createExpectApiSmokeProbes,
  evaluateExpectApiSmoke,
  evaluateInternalTestBookingSmoke,
  evaluateUnauthenticatedApiSurface,
  evaluateUnauthenticatedBookingWrite,
  runInternalTestBookingSmokeCli,
  smokeInternalTestBooking
} from './internal-test-booking-smoke.mjs';

function probesWithStatus(status) {
  return INTERNAL_TEST_SMOKE_PROBES.map((probe) => ({
    method: probe.method,
    path: probe.path,
    status
  }));
}

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
  it('treats 503 and 401 as fail-closed and 404 as API-not-mounted', () => {
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
      }).ok
    ).toBe(false);
    expect(
      evaluateUnauthenticatedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 404
      }).reason
    ).toMatch(/api-not-mounted/);
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
  it('passes when create, lookup, mutations, and schedule stay fail-closed', () => {
    expect(evaluateInternalTestBookingSmoke(probesWithStatus(503))).toEqual({
      ok: true,
      issues: []
    });
    expect(evaluateInternalTestBookingSmoke(probesWithStatus(404)).ok).toBe(
      false
    );
    expect(
      evaluateInternalTestBookingSmoke(probesWithStatus(404)).issues.join('\n')
    ).toMatch(/api-not-mounted/);
  });

  it('fails if an unauthenticated create, lookup, or delete succeeds', () => {
    const created = evaluateInternalTestBookingSmoke(
      probesWithStatus(503).map((probe) =>
        probe.path === '/v1/bookings' && probe.method === 'POST'
          ? { ...probe, status: 201 }
          : probe
      )
    );
    expect(created.ok).toBe(false);
    expect(created.issues.join('\n')).toMatch(/POST \/v1\/bookings/);
    const listed = evaluateInternalTestBookingSmoke(
      probesWithStatus(503).map((probe) =>
        probe.path === '/v1/slots' ? { ...probe, status: 200 } : probe
      )
    );
    expect(listed.ok).toBe(false);
    expect(listed.issues.join('\n')).toMatch(/GET \/v1\/slots/);
    const deleted = evaluateInternalTestBookingSmoke(
      probesWithStatus(503).map((probe) =>
        probe.path.endsWith('/delete') ? { ...probe, status: 201 } : probe
      )
    );
    expect(deleted.ok).toBe(false);
    expect(deleted.issues.join('\n')).toMatch(/\/delete/);
  });
});

describe('expect-api mode', () => {
  it('requires mounted GETs and auth denial for every write probe', () => {
    const probes = createExpectApiSmokeProbes('expect-api-test-key').map(
      (probe) => ({
        method: probe.method,
        path: probe.path,
        status:
          probe.method === 'GET' &&
          ['/v1/health', '/v1/slots', '/v1/schedule'].includes(probe.path)
            ? 200
            : 403
      })
    );
    expect(evaluateExpectApiSmoke(probes)).toMatchObject({
      ok: true,
      issues: [],
      mode: 'expect-api'
    });
    expect(evaluateExpectApiSmoke(probes).probes).toEqual(
      probes.map(({ method, path, status }) => ({ method, path, status }))
    );
  });

  it.each([201, 400, 404, 500, 503])(
    'rejects a write status of %s instead of 401/403',
    (status) => {
      const probes = createExpectApiSmokeProbes('expect-api-test-key').map(
        (probe) => ({
          method: probe.method,
          path: probe.path,
          status:
            probe.method === 'GET' &&
            ['/v1/health', '/v1/slots', '/v1/schedule'].includes(probe.path)
              ? 200
              : status
        })
      );
      expect(evaluateExpectApiSmoke(probes).ok).toBe(false);
    }
  );

  it('rejects every non-200 required GET status', () => {
    for (const status of [201, 400, 404, 500, 503]) {
      const probes = createExpectApiSmokeProbes('expect-api-test-key').map(
        (probe) => ({
          method: probe.method,
          path: probe.path,
          status:
            probe.method === 'GET' && probe.path === '/v1/health'
              ? status
              : probe.method === 'GET'
                ? 200
                : 403
        })
      );
      expect(evaluateExpectApiSmoke(probes).ok).toBe(false);
    }
  });

  it('uses schema-valid, non-PII bodies and a distinct schedule key', () => {
    const probes = createExpectApiSmokeProbes('expect-api-test-key');
    const booking = probes.find(
      (probe) => probe.path === '/v1/bookings' && probe.method === 'POST'
    );
    const publish = probes.find(
      (probe) => probe.path === '/v1/schedule/publish'
    );
    expect(booking.body).toMatchObject({
      slotId: 'slot_20300102_1200',
      serviceId: 'service_consult',
      bookingKind: 'initial'
    });
    expect(booking.body).not.toHaveProperty('intake');
    expect(booking.body).not.toHaveProperty('onBehalfPatientId');
    expect(publish.body).toMatchObject({
      expectedVersion: 999999,
      schedule: EXPECT_API_CANONICAL_SCHEDULE
    });
    expect(publish.body.idempotencyKey).toContain('expect-api-test-key');
    expect(publish.body.idempotencyKey).not.toBe(booking.body.idempotencyKey);
  });
});

describe('smokeInternalTestBooking', () => {
  it('posts contract bodies without PII and probes every IP-001 write path', async () => {
    const fetchImpl = vi.fn((url, init) => {
      const path = String(url);
      if (path.endsWith('/v1/bookings') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body).not.toHaveProperty('patient');
        expect(body).not.toHaveProperty('nationalId');
        expect(body).not.toHaveProperty('privacyAcceptance');
      }
      if (path.endsWith('/follow-up')) {
        const body = JSON.parse(String(init.body));
        expect(body).not.toHaveProperty('notes');
        expect(body).not.toHaveProperty('certificateCount');
        expect(body).not.toHaveProperty('managerId');
      }
      return Promise.resolve({ status: 503 });
    });
    await expect(smokeInternalTestBooking(PREVIEW, fetchImpl)).resolves.toEqual(
      { ok: true, issues: [] }
    );
    expect(fetchImpl).toHaveBeenCalledTimes(INTERNAL_TEST_SMOKE_PROBES.length);
    const paths = fetchImpl.mock.calls.map(
      ([url]) => new URL(String(url)).pathname
    );
    expect(paths).toContain(`/v1/bookings/${SMOKE_APPOINTMENT_ID}/delete`);
    expect(paths).toContain(`/v1/bookings/${SMOKE_APPOINTMENT_ID}/follow-up`);
    expect(paths).toContain('/v1/schedule/publish');
    expect(paths).not.toContain('/v1/health');
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

  it('supports --expect-api probes without allowing any write success', async () => {
    const fetchImpl = vi.fn((url, init) => {
      const path = new URL(String(url)).pathname;
      const status =
        init?.method === 'GET' &&
        ['/v1/health', '/v1/slots', '/v1/schedule'].includes(path)
          ? 200
          : 403;
      return Promise.resolve({ status });
    });
    const result = await smokeInternalTestBooking(PREVIEW, fetchImpl, {
      mode: 'expect-api',
      smokeKey: 'expect-api-test-key'
    });
    expect(result).toMatchObject({
      ok: true,
      issues: [],
      mode: 'expect-api'
    });
    expect(result.probes).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/v1/health', status: 200 },
        { method: 'POST', path: '/v1/bookings', status: 403 },
        {
          method: 'POST',
          path: '/v1/schedule/publish',
          status: 403
        }
      ])
    );
    expect(
      result.probes.every(
        (probe) => Object.keys(probe).sort().join(',') === 'method,path,status'
      )
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(12);
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

  it('selects --expect-api and returns sanitized evidence', async () => {
    const fetchImpl = vi.fn((url, init) => {
      const path = new URL(String(url)).pathname;
      const status =
        init?.method === 'GET' &&
        ['/v1/health', '/v1/slots', '/v1/schedule'].includes(path)
          ? 200
          : 401;
      return Promise.resolve({ status });
    });
    let stdout = '';
    let stderr = '';
    const code = await runInternalTestBookingSmokeCli({
      argv: ['--expect-api', PREVIEW],
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      },
      fetchImpl
    });
    expect(code).toBe(0);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.mode).toBe('expect-api');
    expect(result.ok).toBe(true);
    expect(result.probes).toHaveLength(12);
    expect(result.probes[0]).toEqual({
      method: 'GET',
      path: '/v1/health',
      status: 200
    });
  });

  it('reports sanitized evidence when --expect-api sees a write success', async () => {
    const fetchImpl = vi.fn((url, init) => {
      const path = new URL(String(url)).pathname;
      const status =
        init?.method === 'GET' &&
        ['/v1/health', '/v1/slots', '/v1/schedule'].includes(path)
          ? 200
          : path === '/v1/bookings'
            ? 201
            : 401;
      return Promise.resolve({ status });
    });
    let stdout = '';
    let stderr = '';
    const code = await runInternalTestBookingSmokeCli({
      argv: [PREVIEW, '--expect-api'],
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      },
      fetchImpl
    });
    expect(code).toBe(1);
    expect(stderr).toMatch(/expected 401\/403/);
    const result = JSON.parse(stdout);
    expect(result.mode).toBe('expect-api');
    expect(result.probes).toContainEqual({
      method: 'POST',
      path: '/v1/bookings',
      status: 201
    });
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
