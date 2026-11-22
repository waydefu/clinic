import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import { formatSyntheticAppointmentTitle } from '../apps/web/public/vendor/domain/calendar-sync.js';
import { REQUIRED_PROJECT_ID } from './calendar-pilot-fault-trials.mjs';

// Operator-only live ports for calendar-pilot-convergence-driver.mjs
// (CALENDAR_PILOT_DRIVER_PORTS=<this file>). Not run by CI; tests use fakes.
// Credentials: ADC through `gcloud` child processes only; no key file is read.
const SCHEDULER_JOB = 'internal-test-calendar-sync';
const LOCATION = 'asia-east1';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
const SYNTHETIC_CALENDAR =
  /^synthetic[a-z0-9_-]{3,64}@group\.calendar\.google\.com$/u;
const LINK = /^synthetic_[a-z0-9_]{1,64}$/u;
export const RUN_WINDOW_MS = 10_000; // job is paused again well inside 15 s

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function gcloud(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('gcloud', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error('gcloud failed.'))
    );
  });
}

const utc = (value) => new Date(value).toISOString();
// Same derivation as apps/worker calendar-pilot-event-id.ts.
const eventIdFor = (linkId) =>
  `calpilot${createHash('sha256').update(linkId).digest('hex').slice(0, 40)}`;

export async function createPorts({
  calendarId,
  projectId,
  run = gcloud,
  fetchImpl = fetch,
  firestore,
  wait = sleep
}) {
  const assertScope = () => {
    if (projectId !== REQUIRED_PROJECT_ID)
      throw new Error('Project is not the authorised synthetic project.');
    if (!SYNTHETIC_CALENDAR.test(calendarId))
      throw new Error('A dedicated synthetic calendar id is required.');
  };
  assertScope();
  let db = firestore;
  const getDb = async () => {
    if (db === undefined) {
      const { getApps, initializeApp } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      db = getFirestore(
        getApps()[0] ?? initializeApp({ projectId: REQUIRED_PROJECT_ID })
      );
    }
    return db;
  };
  const scheduler = (verb) =>
    run([
      'scheduler',
      'jobs',
      verb,
      SCHEDULER_JOB,
      '--project',
      REQUIRED_PROJECT_ID,
      '--location',
      LOCATION
    ]);
  let token;
  let tokenAt = 0;
  const accessToken = async () => {
    if (token === undefined || Date.now() - tokenAt > 30 * 60_000) {
      token = await run(['auth', 'application-default', 'print-access-token']);
      tokenAt = Date.now();
    }
    return token;
  };

  return {
    async readScanMarker() {
      assertScope();
      const snapshot = await (
        await getDb()
      )
        .collection('calendar_pilot_configuration')
        .doc('active')
        .get();
      const marker = snapshot.data()?.lastSuccessfulSyncAt;
      return typeof marker === 'string' ? marker : undefined;
    },

    async readExpected(linkId) {
      assertScope();
      if (!LINK.test(linkId)) throw new Error('Non-synthetic link id.');
      const snapshot = await (
        await getDb()
      )
        .collection('calendar_pilot_appointments')
        .doc(linkId)
        .get();
      const data = snapshot.data();
      if (!snapshot.exists || data?.appointmentId !== linkId) return undefined;
      return {
        id: eventIdFor(linkId),
        linkId,
        status: data.status === 'confirmed' ? 'confirmed' : 'cancelled',
        title: formatSyntheticAppointmentTitle({
          patientCode: data.patientCode,
          bookingKind: data.bookingKind,
          serviceId: data.serviceId
        }),
        startsAt: utc(data.startsAt),
        endsAt: utc(data.endsAt)
      };
    },

    async listEvents(requestedCalendar, linkId) {
      assertScope();
      if (requestedCalendar !== calendarId)
        throw new Error('Calendar id differs from the authorised one.');
      if (!LINK.test(linkId)) throw new Error('Non-synthetic link id.');
      const events = [];
      let pageToken;
      do {
        const url = new URL(
          `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
        );
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('showDeleted', 'true');
        url.searchParams.set('maxResults', '100');
        url.searchParams.set(
          'privateExtendedProperty',
          `beauessenceLinkId=${linkId}`
        );
        if (pageToken !== undefined)
          url.searchParams.set('pageToken', pageToken);
        const response = await fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${await accessToken()}` },
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok)
          throw Object.assign(new Error('Calendar list failed.'), {
            status: response.status
          });
        const page = await response.json();
        for (const item of page.items ?? [])
          events.push({
            id: item.id,
            linkId,
            status: item.status,
            title: item.summary,
            startsAt: item.start?.dateTime
              ? utc(item.start.dateTime)
              : undefined,
            endsAt: item.end?.dateTime ? utc(item.end.dateTime) : undefined
          });
        pageToken = page.nextPageToken;
      } while (pageToken !== undefined);
      return events;
    },

    // resume -> run -> pause; the job is always paused again, even when run fails.
    async triggerScan() {
      assertScope();
      await scheduler('resume');
      try {
        await scheduler('run');
        await wait(RUN_WINDOW_MS);
      } finally {
        await scheduler('pause');
      }
    }
  };
}
