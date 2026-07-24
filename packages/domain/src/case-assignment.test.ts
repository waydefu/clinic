import { describe, expect, it } from 'vitest';

import type { AuditContext } from './audit.js';
import {
  assertConsistentAssignmentHistory,
  planCaseAssignment,
  toActiveCaseAssignment,
  type CaseAssignmentPeriod,
  type CaseAssignmentRequest
} from './case-assignment.js';
import { DomainError } from './errors.js';
import type { IdempotencyContext } from './idempotency.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const AUDIT: AuditContext = {
  actorId: 'actor_case_owner',
  actorRole: 'test_case_manager_owner',
  correlationId: 'corr_case_1',
  source: 'api',
  reasonCode: null,
  policyVersion: null
};

const IDEMPOTENCY: IdempotencyContext = {
  actorId: 'actor_case_owner',
  scope: 'case:assign',
  requestHash: HASH_A,
  recordId: HASH_B
};

function request(
  overrides: Partial<CaseAssignmentRequest> = {}
): CaseAssignmentRequest {
  return {
    patientId: 'patient_001',
    managerId: 'manager_alpha',
    audit: AUDIT,
    requestedAt: '2026-07-24T02:00:00.000Z',
    idempotency: IDEMPOTENCY,
    ...overrides
  };
}

describe('planCaseAssignment', () => {
  it('plans a first assignment with no closed period', () => {
    const plan = planCaseAssignment(request(), undefined);

    expect(plan.closedPeriod).toBeNull();
    expect(plan.openedPeriod).toMatchObject({
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-24T02:00:00.000Z',
      activeUntil: null
    });
    expect(plan.openedPeriod.id).toBe(`case_${HASH_B}`);
    expect(plan.auditEvent.action).toBe('case_manager_assigned');
    expect(plan.auditEvent.resourceType).toBe('case');
    expect(plan.auditEvent.resourceId).toBe('patient_001');
    expect(plan.auditEvent.before).toBeNull();
    expect(plan.auditEvent.after).toEqual({
      managerId: 'manager_alpha',
      activeFrom: '2026-07-24T02:00:00.000Z',
      activeUntil: null
    });
    expect(plan.idempotencyRecord.responseReference).toEqual({
      resourceType: 'case_assignment',
      resourceId: `case_${HASH_B}`
    });
  });

  it('closes the current period without mutating it on reassignment', () => {
    const current: CaseAssignmentPeriod = {
      id: 'case_existing',
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z',
      activeUntil: null
    };

    const plan = planCaseAssignment(
      request({ managerId: 'manager_beta' }),
      current
    );

    expect(current.activeUntil).toBeNull(); // input untouched
    expect(plan.closedPeriod).toEqual({
      ...current,
      activeUntil: '2026-07-24T02:00:00.000Z'
    });
    expect(plan.openedPeriod.managerId).toBe('manager_beta');
    expect(plan.auditEvent.action).toBe('case_manager_reassigned');
    expect(plan.auditEvent.before).toEqual({
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z',
      activeUntil: '2026-07-24T02:00:00.000Z'
    });
  });

  it('rejects reassigning to the same manager', () => {
    const current: CaseAssignmentPeriod = {
      id: 'case_existing',
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z',
      activeUntil: null
    };
    expect(() => planCaseAssignment(request(), current)).toThrowError(
      DomainError
    );
  });

  it('rejects an effective time at or before the superseded period start', () => {
    const current: CaseAssignmentPeriod = {
      id: 'case_existing',
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-24T02:00:00.000Z',
      activeUntil: null
    };
    expect(() =>
      planCaseAssignment(request({ managerId: 'manager_beta' }), current)
    ).toThrowError(/after the period it supersedes/);
  });

  it('rejects a patient mismatch and an already-closed current period', () => {
    expect(() =>
      planCaseAssignment(request({ managerId: 'manager_beta' }), {
        id: 'case_other',
        patientId: 'patient_999',
        managerId: 'manager_alpha',
        activeFrom: '2026-07-01T00:00:00.000Z',
        activeUntil: null
      })
    ).toThrowError(/different patient/);

    expect(() =>
      planCaseAssignment(request({ managerId: 'manager_beta' }), {
        id: 'case_other',
        patientId: 'patient_001',
        managerId: 'manager_alpha',
        activeFrom: '2026-07-01T00:00:00.000Z',
        activeUntil: '2026-07-10T00:00:00.000Z'
      })
    ).toThrowError(/already closed/);
  });

  it('rejects non-opaque identifiers and non-UTC times', () => {
    expect(() =>
      planCaseAssignment(request({ patientId: 'patient 001' }), undefined)
    ).toThrowError(DomainError);
    expect(() =>
      planCaseAssignment(
        request({ requestedAt: '2026-07-24T02:00:00+08:00' }),
        undefined
      )
    ).toThrowError(/UTC/);
  });
});

describe('toActiveCaseAssignment', () => {
  it('omits activeUntil for an open period and keeps it for a closed one', () => {
    const open = toActiveCaseAssignment({
      id: 'case_open',
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z',
      activeUntil: null
    });
    expect(open).toEqual({
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z'
    });
    expect('activeUntil' in open).toBe(false);

    const closed = toActiveCaseAssignment({
      id: 'case_closed',
      patientId: 'patient_001',
      managerId: 'manager_alpha',
      activeFrom: '2026-07-01T00:00:00.000Z',
      activeUntil: '2026-07-10T00:00:00.000Z'
    });
    expect(closed.activeUntil).toBe('2026-07-10T00:00:00.000Z');
  });
});

describe('assertConsistentAssignmentHistory', () => {
  it('accepts a contiguous history with a single open period', () => {
    expect(() =>
      assertConsistentAssignmentHistory([
        {
          id: 'p1',
          patientId: 'patient_001',
          managerId: 'manager_alpha',
          activeFrom: '2026-07-01T00:00:00.000Z',
          activeUntil: '2026-07-10T00:00:00.000Z'
        },
        {
          id: 'p2',
          patientId: 'patient_001',
          managerId: 'manager_beta',
          activeFrom: '2026-07-10T00:00:00.000Z',
          activeUntil: null
        }
      ])
    ).not.toThrow();
  });

  it('rejects overlapping periods, two open periods and an end before start', () => {
    expect(() =>
      assertConsistentAssignmentHistory([
        {
          id: 'p1',
          patientId: 'patient_001',
          managerId: 'manager_alpha',
          activeFrom: '2026-07-01T00:00:00.000Z',
          activeUntil: '2026-07-15T00:00:00.000Z'
        },
        {
          id: 'p2',
          patientId: 'patient_001',
          managerId: 'manager_beta',
          activeFrom: '2026-07-10T00:00:00.000Z',
          activeUntil: null
        }
      ])
    ).toThrowError(/overlap/);

    expect(() =>
      assertConsistentAssignmentHistory([
        {
          id: 'p1',
          patientId: 'patient_001',
          managerId: 'manager_alpha',
          activeFrom: '2026-07-01T00:00:00.000Z',
          activeUntil: null
        },
        {
          id: 'p2',
          patientId: 'patient_001',
          managerId: 'manager_beta',
          activeFrom: '2026-07-10T00:00:00.000Z',
          activeUntil: null
        }
      ])
    ).toThrowError(/most recent/);

    expect(() =>
      assertConsistentAssignmentHistory([
        {
          id: 'p1',
          patientId: 'patient_001',
          managerId: 'manager_alpha',
          activeFrom: '2026-07-10T00:00:00.000Z',
          activeUntil: '2026-07-01T00:00:00.000Z'
        }
      ])
    ).toThrowError(/end after it begins/);
  });
});
