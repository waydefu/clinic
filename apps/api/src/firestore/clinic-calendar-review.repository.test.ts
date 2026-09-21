import { describe, expect, it } from 'vitest';
import { parseOutboxSnapshot } from '@beauessence/domain';

import { clinicCalendarRestoreOutbox } from './clinic-calendar-review.repository.js';

describe('clinic Calendar rejection restore outbox', () => {
  it('reuses the appointment projection event and carries safe trace fields', () => {
    const planned = clinicCalendarRestoreOutbox({
      candidateId: 'candidate_001',
      appointmentId: 'appointment_001',
      auditEventId: 'audit_001',
      occurredAt: '2026-09-20T12:00:00.000Z'
    });

    expect(planned).toEqual({
      id: 'outbox_calendar_review_candidate_001',
      record: {
        type: 'calendar_projection_requested',
        appointmentId: 'appointment_001',
        correlationId: 'calendar_review_candidate_001',
        causationId: 'audit_001',
        idempotencyKey: expect.stringMatching(/^[0-9a-v]{5,1024}$/u),
        status: 'pending',
        attempts: 0,
        createdAt: '2026-09-20T12:00:00.000Z',
        nextAttemptAt: '2026-09-20T12:00:00.000Z'
      }
    });
    expect(parseOutboxSnapshot(planned.id, planned.record)).toMatchObject({
      appointmentId: 'appointment_001',
      status: 'pending',
      attempts: 0,
      correlationId: 'calendar_review_candidate_001',
      causationId: 'audit_001'
    });
  });
});
