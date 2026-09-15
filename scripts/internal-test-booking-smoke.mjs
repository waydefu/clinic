import { pathToFileURL } from 'node:url';

import {
  evaluateFailClosedApiSurface,
  evaluatePublicBookingGateOpen
} from '@beauessence/domain';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId
} from './isolated-c1-project-id.mjs';

export const FORBIDDEN_STAGING_HOST = `${FORBIDDEN_STAGING_PROJECT}.web.app`;

/**
 * Isolated Hosting preview only: `{project}--{channel}.web.app`.
 * The live channel (`{project}.web.app`) is refused — Safety Floor 8.
 */
const ISOLATED_PREVIEW_HOST =
  /^beauessence-clinic-stg-[a-z0-9]{1,7}--[a-z0-9-]+\.web\.app$/;

export function isolatedProjectIdFromPreviewHost(hostname) {
  const match = String(hostname).match(
    /^(beauessence-clinic-stg-[a-z0-9]{1,7})--[a-z0-9-]+\.web\.app$/
  );
  return match?.[1];
}

export function assertInternalTestSmokeTarget(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new Error('internal-test smoke requires an https preview URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('internal-test smoke requires https without credentials.');
  }
  const hostname = url.hostname;
  if (
    hostname === FORBIDDEN_STAGING_HOST ||
    hostname.endsWith(`.${FORBIDDEN_STAGING_HOST}`) ||
    hostname.startsWith(`${FORBIDDEN_STAGING_PROJECT}--`)
  ) {
    throw new Error(
      'internal-test smoke refuses beauessence-clinic-staging; earlier synthetic-review packets are not reusable.'
    );
  }
  if (!ISOLATED_PREVIEW_HOST.test(hostname)) {
    throw new Error(
      'internal-test smoke requires an isolated preview host `{project}--{channel}.web.app`, not the live channel.'
    );
  }
  const projectId = isolatedProjectIdFromPreviewHost(hostname);
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error('internal-test smoke host is not an isolated C1 project.');
  }
  return url;
}

/**
 * Unauthenticated booking writes and lookups must not succeed as public
 * production. Gate closed → 503. Staff unauthenticated → 401/403. Isolated
 * static Hosting 404 is API-not-mounted, never a healthy fail-closed API.
 * GET /v1/health is liveness, not this check.
 */
export function evaluateUnauthenticatedApiSurface({ method, path, status }) {
  return evaluateFailClosedApiSurface({ method, path, status });
}

export { evaluatePublicBookingGateOpen };

export function evaluateUnauthenticatedBookingWrite({ status }) {
  return evaluateUnauthenticatedApiSurface({
    method: 'POST',
    path: '/v1/bookings',
    status
  });
}

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
};
const ACCEPT_JSON = { Accept: 'application/json' };
export const SMOKE_APPOINTMENT_ID = 'appointment_smoke_001';

function jsonProbe(method, path, body) {
  return { method, path, headers: JSON_HEADERS, body };
}

function getProbe(path) {
  return { method: 'GET', path, headers: ACCEPT_JSON };
}

/** IP-001 create/query/reschedule/cancel/complete/no-show/follow-up/delete plus schedule. */
export const INTERNAL_TEST_SMOKE_PROBES = [
  jsonProbe('POST', '/v1/bookings', {
    idempotencyKey: 'booking-idempotency-0099',
    slotId: 'slot_20300102_1200',
    serviceId: 'service_consult',
    bookingKind: 'initial'
  }),
  getProbe('/v1/slots'),
  getProbe('/v1/schedule'),
  jsonProbe('POST', '/v1/schedule/publish', {
    idempotencyKey: 'booking-idempotency-0095',
    expectedVersion: 0
  }),
  getProbe(`/v1/bookings/${SMOKE_APPOINTMENT_ID}`),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/cancel`, {
    idempotencyKey: 'booking-idempotency-0098'
  }),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/reschedule`, {
    idempotencyKey: 'booking-idempotency-0097',
    targetSlotId: 'slot_20300102_1230'
  }),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/complete`, {
    idempotencyKey: 'complete-idempotency-0099'
  }),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/no-show`, {
    idempotencyKey: 'complete-idempotency-0098'
  }),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/follow-up`, {
    idempotencyKey: 'follow-up-idempotency-0099',
    decision: 'not_required'
  }),
  jsonProbe('POST', `/v1/bookings/${SMOKE_APPOINTMENT_ID}/delete`, {
    idempotencyKey: 'booking-idempotency-0096',
    reasonCode: 'created_in_error'
  })
];

export function evaluateInternalTestBookingSmoke(probes) {
  const issues = [];
  for (const probe of probes) {
    const result = evaluateUnauthenticatedApiSurface(probe);
    if (!result.ok) issues.push(result.reason);
  }
  return { ok: issues.length === 0, issues };
}

export async function smokeInternalTestBooking(
  previewUrl,
  fetchImpl = globalThis.fetch.bind(globalThis)
) {
  const base = assertInternalTestSmokeTarget(previewUrl);
  const probes = [];
  for (const spec of INTERNAL_TEST_SMOKE_PROBES) {
    const response = await fetchImpl(new URL(spec.path, base), {
      method: spec.method,
      headers: spec.headers,
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) })
    });
    probes.push({
      method: spec.method,
      path: spec.path,
      status: response.status
    });
  }
  return evaluateInternalTestBookingSmoke(probes);
}

export const SMOKE_USAGE =
  'Usage: pnpm smoke:internal-test-booking -- https://{isolated-project}--{channel}.web.app\nDoes not deploy. Requires a named Safety Floor 8 packet before any Hosting deploy.\n';

export async function runInternalTestBookingSmokeCli({
  argv,
  stdout,
  stderr,
  fetchImpl = globalThis.fetch.bind(globalThis)
}) {
  const previewUrl = argv.find((argument) => argument.startsWith('https://'));
  if (previewUrl === undefined) {
    stderr.write(SMOKE_USAGE);
    return 2;
  }
  try {
    const result = await smokeInternalTestBooking(previewUrl, fetchImpl);
    if (!result.ok) {
      stderr.write(`${result.issues.join('\n')}\n`);
      return 1;
    }
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 2;
  }
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const code = await runInternalTestBookingSmokeCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
  process.exitCode = code;
}
