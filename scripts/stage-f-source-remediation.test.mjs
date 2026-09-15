import { describe, expect, it } from 'vitest';

import { OUTBOX_AGE_ALERT_SECONDS } from '@beauessence/domain';

import { ISOLATED_C1_PROJECT_ID } from './internal-test-c1-identity.mjs';
import {
  planStageFHumanAlertProof,
  stageFSyntheticOutboxAgeLog
} from './stage-f-human-alert-proof.mjs';
import {
  STAGE_F_SCHEDULE_IDEMPOTENCY,
  STAGE_F_SYNTHETIC_BLOCKED_TIMES,
  evaluateStageFSyntheticScheduleCanon,
  planStageFSyntheticScheduleBootstrap,
  stageFSyntheticPublishBody
} from './stage-f-synthetic-schedule-bootstrap.mjs';

describe('Stage F synthetic schedule bootstrap', () => {
  it('keeps execute false and refuses cloud mutation', () => {
    const plan = planStageFSyntheticScheduleBootstrap();
    expect(plan.execute).toBe(false);
    expect(plan.cloudMutation).toBe('NONE');
    expect(plan.projectId).toBe(ISOLATED_C1_PROJECT_ID);
    expect(plan.path).toBe('/v1/schedule/publish');
    expect(plan.body.expectedVersion).toBe(0);
    expect(plan.body.idempotencyKey).toBe(STAGE_F_SCHEDULE_IDEMPOTENCY);
    expect(plan.body.idempotencyKey.length).toBeGreaterThanOrEqual(16);
    expect(plan.body.schedule.timeZone).toBe('Asia/Taipei');
    expect(plan.body.schedule.blockedTimes).toEqual(
      STAGE_F_SYNTHETIC_BLOCKED_TIMES
    );
    expect(plan.rootCause).toMatch(/published\.schedule is null/);
    expect(plan.canon.ok).toBe(true);
    expect(plan.canon.issues).toEqual([]);
    expect(() =>
      planStageFSyntheticScheduleBootstrap({ execute: true })
    ).toThrow(/CLOUD_MUTATION = NONE/);
    expect(() =>
      planStageFSyntheticScheduleBootstrap({
        projectId: 'beauessence-clinic-staging'
      })
    ).toThrow(/beauessence-clinic-staging/);
  });

  it('honours initial :00/:30, follow_up :15/:45, 30-minute duration, and exclusions', () => {
    expect(evaluateStageFSyntheticScheduleCanon().ok).toBe(true);
    expect(evaluateStageFSyntheticScheduleCanon().issues).toEqual([]);
    const body = stageFSyntheticPublishBody();
    expect(body.schedule.weeklyAvailability.map((row) => row.weekday)).toEqual([
      3, 4, 5, 6
    ]);
  });
});

describe('Stage F human-alert proof plan', () => {
  it('prepares a reversible synthetic outbox-age log and does not claim proven delivery', () => {
    const plan = planStageFHumanAlertProof();
    expect(plan.execute).toBe(false);
    expect(plan.cloudMutation).toBe('NONE');
    expect(plan.humanNotificationProven).toBe(false);
    expect(plan.definitionsOk).toBe(true);
    expect(plan.bookingImpact).toBe('none');
    expect(plan.pii).toBe('none');
    expect(plan.trigger.logLine).toEqual(stageFSyntheticOutboxAgeLog());
    expect(plan.trigger.logLine.oldestPendingAgeSeconds).toBe(
      OUTBOX_AGE_ALERT_SECONDS
    );
    expect(JSON.stringify(plan)).not.toMatch(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    expect(() => planStageFHumanAlertProof({ execute: true })).toThrow(
      /Do not send mail/
    );
  });
});
