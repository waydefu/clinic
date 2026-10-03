import { describe, expect, it } from 'vitest';

import {
  planRetentionCalendarProjections,
  planRetentionOperation
} from './business-delivery-retention.js';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp
} from './calendar-event-id.js';
import { DomainError } from './errors.js';

const policy = { recoverableDays: 30 } as const;
const proof = {
  scopeId: 'scope_c1',
  requestId: 'request_001',
  authorizationReference: 'auth_001',
  reauthenticationReference: 'reauth_001',
  authorized: true,
  reauthenticated: true
} as const;

function archivePlan() {
  return planRetentionOperation({
    operation: 'archive',
    resourceId: 'resource_001',
    requestId: 'request_001',
    state: 'active',
    nowAt: '2030-01-01T00:00:00.000Z',
    legalHold: false,
    policy,
    proof
  });
}

describe('planRetentionOperation', () => {
  it('archives without using appointment cancellation semantics', () => {
    expect(archivePlan()).toEqual({
      operation: 'archive',
      resourceId: 'resource_001',
      requestId: 'request_001',
      resultingState: 'archived',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      auditRequired: true,
      backupTreatment: 'unchanged_separate_process',
      dependencyCheck: 'not_required',
      idempotency: 'new_operation'
    });
  });

  it('keeps the original archive boundary on repeated archive requests', () => {
    expect(
      planRetentionOperation({
        operation: 'archive',
        resourceId: 'resource_001',
        requestId: 'request_002',
        state: 'archived',
        nowAt: '2030-01-10T00:00:00.000Z',
        archivedAt: '2030-01-01T00:00:00.000Z',
        recoverableUntil: '2030-01-31T00:00:00.000Z',
        legalHold: false,
        policy,
        proof: { ...proof, requestId: 'request_002' }
      })
    ).toMatchObject({
      resultingState: 'archived',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      idempotency: 'already_applied'
    });
  });

  it('restores before the exact expiry and rejects restoration at expiry', () => {
    const common = {
      operation: 'restore' as const,
      resourceId: 'resource_001',
      state: 'archived' as const,
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      legalHold: false,
      policy
    };
    expect(
      planRetentionOperation({
        ...common,
        requestId: 'request_003',
        nowAt: '2030-01-30T23:59:59.999Z',
        proof: { ...proof, requestId: 'request_003' }
      })
    ).toMatchObject({ resultingState: 'active', archivedAt: null });
    expect(() =>
      planRetentionOperation({
        ...common,
        requestId: 'request_004',
        nowAt: '2030-01-31T00:00:00.000Z',
        proof: { ...proof, requestId: 'request_004' }
      })
    ).toThrow(/expired/);
  });

  it('allows restoration without re-authentication while preserving the cutoff', () => {
    expect(
      planRetentionOperation({
        operation: 'restore',
        resourceId: 'resource_001',
        requestId: 'request_009',
        state: 'archived',
        nowAt: '2030-01-30T00:00:00.000Z',
        archivedAt: '2030-01-01T00:00:00.000Z',
        recoverableUntil: '2030-01-31T00:00:00.000Z',
        legalHold: false,
        policy,
        proof: {
          scopeId: 'scope_c1',
          requestId: 'request_009',
          authorizationReference: 'auth_001',
          authorized: true,
          reauthenticated: false
        }
      })
    ).toMatchObject({ resultingState: 'active', idempotency: 'new_operation' });
  });

  it('requires the explicit delete gate after the recovery window', () => {
    const common = {
      operation: 'permanent_delete' as const,
      resourceId: 'resource_001',
      state: 'archived' as const,
      nowAt: '2030-01-31T00:00:00.000Z',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      legalHold: false,
      policy
    };
    expect(() =>
      planRetentionOperation({
        ...common,
        requestId: 'request_005',
        proof: { ...proof, requestId: 'request_005' }
      })
    ).toThrow(/reconciled/);
    expect(
      planRetentionOperation({
        ...common,
        requestId: 'request_006',
        dependenciesReconciled: true,
        proof: { ...proof, requestId: 'request_006' }
      })
    ).toMatchObject({
      resultingState: 'permanently_deleted',
      dependencyCheck: 'complete',
      backupTreatment: 'unchanged_separate_process'
    });
  });

  it('blocks legal hold and missing re-authentication, and is idempotent after deletion', () => {
    expect(() =>
      planRetentionOperation({
        operation: 'permanent_delete',
        resourceId: 'resource_001',
        requestId: 'request_007',
        state: 'archived',
        nowAt: '2030-01-31T00:00:00.000Z',
        archivedAt: '2030-01-01T00:00:00.000Z',
        recoverableUntil: '2030-01-31T00:00:00.000Z',
        legalHold: true,
        dependenciesReconciled: true,
        policy,
        proof: { ...proof, requestId: 'request_007' }
      })
    ).toThrow(DomainError);
    expect(
      planRetentionOperation({
        operation: 'permanent_delete',
        resourceId: 'resource_001',
        requestId: 'request_008',
        state: 'permanently_deleted',
        nowAt: '2030-02-01T00:00:00.000Z',
        legalHold: false,
        policy,
        proof: { ...proof, requestId: 'request_008' }
      })
    ).toMatchObject({
      resultingState: 'permanently_deleted',
      idempotency: 'already_applied'
    });
  });
});

describe('planRetentionCalendarProjections', () => {
  const at = '2030-01-01T00:00:00.000Z';
  const appointments = [
    { id: 'appt_done', status: 'completed' },
    { id: 'appt_gone', status: 'cancelled' }
  ];
  const followUps = [
    {
      appointmentId: 'appt_done',
      decision: 'required',
      dueAt: '2030-02-01T02:00:00.000Z'
    },
    { appointmentId: 'appt_undated', decision: 'required', dueAt: null },
    { appointmentId: 'appt_none', decision: 'not_required', dueAt: null }
  ];

  it('re-projects every appointment and dated reminder on archive', () => {
    const jobs = planRetentionCalendarProjections({
      operation: 'archive',
      requestId: 'retention_abc',
      at,
      appointments,
      followUps
    });
    expect(
      jobs.map((job) => [job.appointmentId, job.appointmentStatus])
    ).toEqual([
      ['appt_done', 'completed'],
      ['appt_gone', 'cancelled'],
      ['appt_done', 'follow_up_required']
    ]);
    expect(jobs[0]?.idempotencyKey).toBe(
      calendarEventIdForAppointment('appt_done')
    );
    expect(jobs[2]).toMatchObject({
      followUpSourceId: 'appt_done',
      startsAt: '2030-02-01T02:00:00.000Z',
      idempotencyKey: calendarEventIdForFollowUp('appt_done')
    });
    expect(new Set(jobs.map((job) => job.id)).size).toBe(jobs.length);
  });

  it('cancels every appointment event and dated reminder on permanent delete', () => {
    const jobs = planRetentionCalendarProjections({
      operation: 'permanent_delete',
      requestId: 'retention_abc',
      at,
      appointments,
      followUps
    });
    expect(jobs.map((job) => job.appointmentStatus)).toEqual([
      'deleted',
      'deleted',
      'follow_up_not_required'
    ]);
    expect(jobs[2]).not.toHaveProperty('startsAt');
  });

  it('keeps PII-free, pending, immediately-due jobs with distinct ids per operation', () => {
    const archive = planRetentionCalendarProjections({
      operation: 'archive',
      requestId: 'retention_abc',
      at,
      appointments,
      followUps
    });
    const restore = planRetentionCalendarProjections({
      operation: 'restore',
      requestId: 'retention_abc',
      at,
      appointments,
      followUps
    });
    for (const job of [...archive, ...restore]) {
      expect(job).toMatchObject({
        type: 'calendar_projection_requested',
        status: 'pending',
        attempts: 0,
        createdAt: at,
        nextAttemptAt: at,
        correlationId: 'retention_abc',
        causationId: 'retention_abc'
      });
      expect(Object.keys(job).sort()).toEqual(
        expect.not.arrayContaining(['name', 'phoneDigits', 'birthMonthDay'])
      );
    }
    const archiveIds = new Set(archive.map((job) => job.id));
    expect(restore.some((job) => archiveIds.has(job.id))).toBe(false);
  });

  it('rejects non-opaque identifiers', () => {
    expect(() =>
      planRetentionCalendarProjections({
        operation: 'archive',
        requestId: 'retention_abc',
        at,
        appointments: [{ id: 'bad/id', status: 'confirmed' }],
        followUps: []
      })
    ).toThrow(DomainError);
  });
});
