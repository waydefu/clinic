import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  initialTestOnlyFollowUpDecision,
  setTestOnlyFollowUpDecision
} from './test-only-follow-up.js';

describe('test-only follow-up decision', () => {
  it('requires a staff decision and a target date only when follow-up is required', () => {
    const result = setTestOnlyFollowUpDecision(
      initialTestOnlyFollowUpDecision(),
      {
        status: 'required',
        dueDate: '2030-01-15',
        actor: { id: 'actor_test_clinic_admin_001', role: 'test_clinic_admin' },
        decidedAt: '2030-01-02T02:00:00.000Z'
      }
    );

    expect(result.decision).toEqual({
      status: 'required',
      dueDate: '2030-01-15',
      decidedBy: 'actor_test_clinic_admin_001',
      decidedAt: '2030-01-02T02:00:00.000Z'
    });
    expect(result.auditEvent.previousStatus).toBe('unknown');
  });

  it('does not allow a patient actor or a mismatched due date', () => {
    const unauthorised = () =>
      setTestOnlyFollowUpDecision(initialTestOnlyFollowUpDecision(), {
        status: 'required',
        dueDate: '2030-01-15',
        actor: { id: 'actor_test_patient_001', role: 'test_patient' },
        decidedAt: '2030-01-02T02:00:00.000Z'
      });
    expect(unauthorised).toThrow(DomainError);
    try {
      unauthorised();
    } catch (error) {
      expect(error).toMatchObject({ code: 'COMPLETION_NOT_AUTHORIZED' });
    }

    const mismatchedDate = () =>
      setTestOnlyFollowUpDecision(initialTestOnlyFollowUpDecision(), {
        status: 'not_required',
        dueDate: '2030-01-15',
        actor: { id: 'actor_test_clinic_admin_001', role: 'test_clinic_admin' },
        decidedAt: '2030-01-02T02:00:00.000Z'
      });
    expect(mismatchedDate).toThrow(DomainError);
    try {
      mismatchedDate();
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_VALUE' });
    }
  });
});
