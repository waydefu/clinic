import { pathToFileURL } from 'node:url';

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
 * Unauthenticated booking/slots must not succeed. Gate closed → 503.
 * Gate open → 401. A 2xx create or list is a public-write defect.
 */
export function evaluateUnauthenticatedApiSurface({ method, path, status }) {
  if (status === 503 || status === 401) {
    return { ok: true, status, reason: 'fail-closed' };
  }
  if (status >= 200 && status < 300) {
    return {
      ok: false,
      status,
      reason: `${method} ${path} returned ${status}: unauthenticated 2xx means production default is not OFF`
    };
  }
  return {
    ok: false,
    status,
    reason: `${method} ${path} returned unexpected status ${status}`
  };
}

export function evaluateUnauthenticatedBookingWrite({ status }) {
  return evaluateUnauthenticatedApiSurface({
    method: 'POST',
    path: '/v1/bookings',
    status
  });
}

export function evaluateInternalTestBookingSmoke({
  bookingWriteStatus,
  slotsStatus
}) {
  const issues = [];
  for (const result of [
    evaluateUnauthenticatedApiSurface({
      method: 'POST',
      path: '/v1/bookings',
      status: bookingWriteStatus
    }),
    evaluateUnauthenticatedApiSurface({
      method: 'GET',
      path: '/v1/slots',
      status: slotsStatus
    })
  ]) {
    if (!result.ok) issues.push(result.reason);
  }
  return { ok: issues.length === 0, issues };
}

export async function smokeInternalTestBooking(
  previewUrl,
  fetchImpl = globalThis.fetch.bind(globalThis)
) {
  const base = assertInternalTestSmokeTarget(previewUrl);
  const booking = await fetchImpl(new URL('/v1/bookings', base), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: 'booking-idempotency-0099',
      slotId: 'slot_20300102_1200',
      serviceId: 'service_consult',
      bookingKind: 'initial'
    })
  });
  const slots = await fetchImpl(new URL('/v1/slots', base), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  return evaluateInternalTestBookingSmoke({
    bookingWriteStatus: booking.status,
    slotsStatus: slots.status
  });
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
