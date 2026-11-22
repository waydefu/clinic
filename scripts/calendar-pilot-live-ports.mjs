import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import { formatSyntheticAppointmentTitle } from '../apps/web/public/vendor/domain/calendar-sync.js';
import {
  APPOINTMENT_ID,
  GOOGLE_CALENDAR_ID,
  REQUIRED_PROJECT_ID
} from './calendar-pilot-fault-trials.mjs';

// Operator-only live ports for calendar-pilot-convergence-driver.mjs
// (CALENDAR_PILOT_DRIVER_PORTS=<this file>). Not run by CI; tests use fakes.
// Credentials: ADC through `gcloud` child processes only; no key file is read.
const SCHEDULER_JOB = 'internal-test-calendar-sync';
const LOCATION = 'asia-east1';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
// No secret is read: event ids derive from the linkId (calpilot+sha256) and only the worker
// writes to the real destination, so a wrong calendar can only fail to converge, never pass.
// The summary check below keeps the driver from reading a real clinic calendar.
const CALENDAR_PREFIX = 'CAL-PILOT';
// packages/contracts SyntheticPatientCodeSchema: the only patient codes in C1.
const SYNTHETIC_PATIENT_CODE = /^A(?:0[1-9]|[12][0-9]|30)$/u;
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
    if (!GOOGLE_CALENDAR_ID.test(calendarId))
      throw new Error('A Google group calendar id is required.');
  };
  assertScope();
  let calendarVerified = false;
  const assertAuthorisedCalendar = async () => {
    assertScope();
    if (calendarVerified) return;
    const response = await fetchImpl(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
      {
        headers: { Authorization: `Bearer ${await accessToken()}` },
        signal: AbortSignal.timeout(30_000)
      }
    );
    if (!response.ok)
      throw Object.assign(new Error('Calendar metadata failed.'), {
        status: response.status
      });
    const { summary } = await response.json();
    if (typeof summary !== 'string' || !summary.startsWith(CALENDAR_PREFIX))
      throw new Error('Calendar is not the CAL-PILOT synthetic destination.');
    calendarVerified = true;
  };
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
    assertAuthorisedCalendar,

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
      if (!APPOINTMENT_ID.test(linkId))
        throw new Error('Link id is not an appointment id.');
      const snapshot = await (
        await getDb()
      )
        .collection('calendar_pilot_appointments')
        .doc(linkId)
        .get();
      const data = snapshot.data();
      if (!snapshot.exists || data?.appointmentId !== linkId) return undefined;
      if (!SYNTHETIC_PATIENT_CODE.test(data.patientCode))
        throw new Error('Appointment is not marked synthetic.');
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
      await assertAuthorisedCalendar();
      if (requestedCalendar !== calendarId)
        throw new Error('Calendar id differs from the authorised one.');
      if (!APPOINTMENT_ID.test(linkId))
        throw new Error('Link id is not an appointment id.');
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
