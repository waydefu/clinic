import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CALENDAR_PILOT_SCHEDULE,
  SLOT_DURATION_MINUTES,
  SLOT_MINUTE_MARKS,
  planSlots
} from '@beauessence/domain';

import { FORBIDDEN_STAGING_PROJECT } from './isolated-c1-project-id.mjs';
import { ISOLATED_C1_PROJECT_ID } from './internal-test-c1-identity.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const STAGE_F_SCHEDULE_IDEMPOTENCY_KEY = 'stagef_c1_schedule_publish_v0';

export const STAGE_F_SYNTHETIC_BLOCKED_TIMES = Object.freeze({
  initial: Object.freeze(['13:00', '15:00', '17:00']),
  follow_up: Object.freeze(['13:15', '15:15', '17:15'])
});

export const STAGE_F_WORKER_CALENDAR_IDENTITY =
  'internal-test-outbox@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com';

export function stageFSyntheticPublishSchedule() {
  return {
    ...CALENDAR_PILOT_SCHEDULE,
    blockedTimes: {
      initial: [...STAGE_F_SYNTHETIC_BLOCKED_TIMES.initial],
      follow_up: [...STAGE_F_SYNTHETIC_BLOCKED_TIMES.follow_up]
    }
  };
}

export function stageFSyntheticPublishBody() {
  return {
    idempotencyKey: STAGE_F_SCHEDULE_IDEMPOTENCY_KEY,
    expectedVersion: 0,
    schedule: stageFSyntheticPublishSchedule()
  };
}

function taipeiClock(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso));
}

export function evaluateStageFSyntheticScheduleCanon(
  schedule = stageFSyntheticPublishSchedule()
) {
  const issues = [];
  const openDay = planSlots(schedule, [], {
    startDate: '2030-01-02',
    dayCount: 1
  });
  const closedDay = planSlots(schedule, [], {
    startDate: '2030-01-06',
    dayCount: 1
  });
  const extraOpen = planSlots(
    {
      ...schedule,
      dateExceptions: [
        {
          date: '2030-01-06',
          kind: 'extra_open',
          intervals: [{ startLocalTime: '10:00', endLocalTime: '12:00' }]
        }
      ]
    },
    [],
    { startDate: '2030-01-06', dayCount: 1 }
  );
  const occupiedId = openDay[0]?.id;
  const withOccupancy =
    occupiedId === undefined
      ? []
      : planSlots(
          schedule,
          openDay.map((slot, index) =>
            index === 0
              ? { ...slot, reservationId: 'appointment_synth_001' }
              : slot
          ),
          { startDate: '2030-01-02', dayCount: 1 }
        );

  if (SLOT_DURATION_MINUTES !== 30) {
    issues.push('SLOT_DURATION_MINUTES must remain 30.');
  }
  if (JSON.stringify(SLOT_MINUTE_MARKS.initial) !== JSON.stringify([0, 30])) {
    issues.push('initial marks must remain :00 / :30.');
  }
  if (
    JSON.stringify(SLOT_MINUTE_MARKS.follow_up) !== JSON.stringify([15, 45])
  ) {
    issues.push('follow_up marks must remain :15 / :45.');
  }
  if (openDay.length === 0) {
    issues.push(
      'Stage F synthetic schedule must publish slots on an open weekday.'
    );
  }
  for (const slot of openDay) {
    const minute = Number(taipeiClock(slot.startsAt).slice(3));
    if (!SLOT_MINUTE_MARKS[slot.kind].includes(minute)) {
      issues.push(`slot ${slot.id} is off the ${slot.kind} grid.`);
    }
  }
  const clocks = openDay.map((slot) => taipeiClock(slot.startsAt));
  for (const blocked of STAGE_F_SYNTHETIC_BLOCKED_TIMES.initial) {
    if (clocks.includes(blocked)) {
      issues.push(`blocked initial ${blocked} leaked onto the published grid.`);
    }
  }
  for (const blocked of STAGE_F_SYNTHETIC_BLOCKED_TIMES.follow_up) {
    if (clocks.includes(blocked)) {
      issues.push(
        `blocked follow_up ${blocked} leaked onto the published grid.`
      );
    }
  }
  if (closedDay.length !== 0) {
    issues.push('Sunday (weekly closed) must publish zero slots.');
  }
  if (extraOpen.length === 0) {
    issues.push('extra_open on a closed weekday must produce slots.');
  }
  if (
    occupiedId !== undefined &&
    withOccupancy[0]?.reservationId !== 'appointment_synth_001'
  ) {
    issues.push('occupancy must ride on the regenerated grid.');
  }

  const constants = readFileSync(
    join(root, 'apps/web/public/modules/constants.js'),
    'utf8'
  );
  if (
    !constants.includes("initial: ['13:00', '15:00', '17:00']") ||
    !constants.includes("follow_up: ['13:15', '15:15', '17:15']")
  ) {
    issues.push(
      'Stage F blocked times must stay aligned with DEFAULT_BLOCKED_TIMES.'
    );
  }

  return { ok: issues.length === 0, issues };
}

export function planStageFSyntheticScheduleBootstrap(options = {}) {
  if (options.execute === true) {
    throw new Error(
      'Stage F synthetic schedule bootstrap refuses execute; CLOUD_MUTATION = NONE.'
    );
  }
  const projectId = String(options.projectId ?? ISOLATED_C1_PROJECT_ID);
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      'Stage F synthetic schedule bootstrap refuses beauessence-clinic-staging.'
    );
  }
  if (projectId !== ISOLATED_C1_PROJECT_ID) {
    throw new Error(
      'Stage F synthetic schedule bootstrap requires isolated C1 ' +
        'project beauessence-clinic-stg-c1a01.'
    );
  }
  const canon = evaluateStageFSyntheticScheduleCanon();
  return {
    execute: false,
    cloudMutation: 'NONE',
    projectId,
    rootCause:
      'GET /v1/slots returns { slots: [] } when published.schedule is null. ' +
      'Isolated C1 never published schedules/current. The booking gate only ' +
      'unblocks the route.',
    method: 'POST',
    path: '/v1/schedule/publish',
    authz: 'manager or system_admin staff session + CSRF',
    body: stageFSyntheticPublishBody(),
    calendarAcl:
      'Share the designated synthetic calendar with ' +
      `${STAGE_F_WORKER_CALENDAR_IDENTITY} as events writer. ` +
      'DOMAIN_WIDE_DELEGATION_REQUIRED = NO. Do not enable events.watch.',
    canon,
    verifyAfterFutureApply: [
      'GET /v1/schedule → publishedVersion >= 1',
      'GET /v1/slots → non-empty on open weekdays inside the horizon',
      'closed / blocked / occupied marks remain excluded or reserved'
    ]
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const execute = process.argv.includes('--execute');
  const plan = planStageFSyntheticScheduleBootstrap({
    execute,
    projectId: process.env['GOOGLE_CLOUD_PROJECT'] ?? ISOLATED_C1_PROJECT_ID
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(plan.canon.ok ? 0 : 1);
}
