import { describe, expect, it } from 'vitest';

import {
  planDeletion,
  planReschedule,
  planTransition,
  type AppointmentSnapshot,
  type AppointmentStatusValue,
  type AppointmentTransition
} from './appointment-transition.js';
import type { AuditContext } from './audit.js';
import type { SlotSnapshot } from './booking-transaction.js';
import type { PatientBookingGuardSnapshot } from './booking-transaction.js';
import { fromCalendarEventId, isCalendarEventId } from './calendar-event-id.js';
import { DomainError } from './errors.js';

const NOW = '2026-07-21T09:00:00.000Z';

const appointment: AppointmentSnapshot = {
  id: 'appointment_001',
  slotId: 'slot_20300102_1200',
  patientId: 'patient_001',
  bookingKind: 'initial',
  status: 'confirmed'
};

const patientBookingGuard: PatientBookingGuardSnapshot = {
  activeAppointmentId: appointment.id,
  status: 'confirmed',
  updatedAt: '2026-07-21T08:00:00.000Z'
};

const audit = {
  actorId: 'actor_front_desk_001',
  actorRole: 'test_front_desk',
  correlationId: 'corr_transition_001',
  source: 'api' as const,
  reasonCode: 'test_operator_action',
  policyVersion: null
};

const idempotencyFor = (actorId = audit.actorId) => ({
  actorId,
  scope: `appointment:${appointment.id}:transition`,
  requestHash: 'a'.repeat(64),
  recordId: 'b'.repeat(64)
});

const request = (
  transition: AppointmentTransition,
  overrides: Partial<AppointmentSnapshot> = {}
) =>
  ({
    plan: () =>
      planTransition(
        {
          appointmentId: 'appointment_001',
          transition,
          audit,
          requestedAt: NOW,
          idempotency: idempotencyFor()
        },
        { ...appointment, ...overrides },
        patientBookingGuard
      )
  }) as const;

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

describe('planTransition', () => {
  it('maps each transition to its status and audit action', () => {
    const cases: [AppointmentTransition, AppointmentStatusValue, string][] = [
      [
        'request_cancellation',
        'cancellation_requested',
        'cancellation_requested'
      ],
      ['cancel', 'cancelled', 'appointment_cancelled'],
      ['complete', 'completed', 'appointment_completed'],
      ['no_show', 'no_show', 'appointment_no_show']
    ];
    for (const [transition, status, action] of cases) {
      const plan = request(transition).plan();
      expect(plan.nextStatus).toBe(status);
      expect(plan.auditEvent).toMatchObject({
        action,
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        resourceType: 'appointment',
        resourceId: appointment.id,
        before: {
          status: appointment.status,
          slotId: appointment.slotId
        },
        reasonCode: audit.reasonCode,
        result: 'succeeded',
        correlationId: audit.correlationId,
        source: audit.source,
        policyVersion: null,
        schemaVersion: 2
      });
      expect(plan.outboxJob).toMatchObject({
        correlationId: audit.correlationId,
        causationId: plan.auditEvent.eventId
      });
    }
  });

  // 取消與未到把時段還給其他患者；提出取消只是等櫃台確認，完成到診是已經
  // 發生的事實，兩者都不釋出。
  it('releases the slot only for cancel and no_show', () => {
    expect(request('cancel').plan().releaseSlotId).toBe(appointment.slotId);
    expect(request('no_show').plan().releaseSlotId).toBe(appointment.slotId);
    expect(request('complete').plan().releaseSlotId).toBeUndefined();
    expect(
      request('request_cancellation').plan().releaseSlotId
    ).toBeUndefined();
  });

  it('records completedAt only when completing', () => {
    expect(request('complete').plan().completedAt).toBe(NOW);
    expect(request('cancel').plan().completedAt).toBeUndefined();
  });

  it('retains the guard for a cancellation request and releases it for terminal states', () => {
    expect(request('request_cancellation').plan().patientBookingGuard).toEqual({
      action: 'retain',
      guard: {
        activeAppointmentId: appointment.id,
        status: 'cancellation_requested',
        updatedAt: NOW
      }
    });
    for (const transition of ['cancel', 'complete', 'no_show'] as const) {
      expect(request(transition).plan().patientBookingGuard).toEqual({
        action: 'release',
        activeAppointmentId: appointment.id
      });
    }
  });

  // 一筆預約 = 日曆上一個事件。每個狀態各自一個 ID 會讓改期留下殘影、
  // 到診多開一格，而取消去刪一個從未建立過的 ID（2026-07-22 解法 A）。
  it('keys every status to the same calendar event', () => {
    const keys = (
      [
        'request_cancellation',
        'cancel',
        'complete',
        'no_show'
      ] as AppointmentTransition[]
    ).map((transition) => request(transition).plan().outboxJob.idempotencyKey);

    expect(new Set(keys).size).toBe(1);
    expect(isCalendarEventId(keys[0] as string)).toBe(true);
    // 鍵是編碼後的 Calendar event ID；解回來才是可讀的邏輯鍵。
    expect(fromCalendarEventId(keys[0] as string)).toBe(
      'calendar_appointment_001'
    );
  });

  it('allows cancel and no_show from a pending cancellation', () => {
    for (const transition of ['cancel', 'no_show'] as const) {
      expect(() =>
        request(transition, { status: 'cancellation_requested' }).plan()
      ).not.toThrow();
    }
  });

  it('refuses to complete or re-request cancellation once it is pending', () => {
    for (const transition of ['complete', 'request_cancellation'] as const) {
      expect(
        codeOf(() =>
          request(transition, { status: 'cancellation_requested' }).plan()
        )
      ).toBe('TRANSITION_NOT_ALLOWED');
    }
  });

  it('refuses every transition once the appointment has finished', () => {
    const finished: AppointmentStatusValue[] = [
      'cancelled',
      'completed',
      'no_show'
    ];
    const transitions: AppointmentTransition[] = [
      'request_cancellation',
      'cancel',
      'complete',
      'no_show'
    ];
    for (const status of finished)
      for (const transition of transitions)
        expect(codeOf(() => request(transition, { status }).plan())).toBe(
          'TRANSITION_NOT_ALLOWED'
        );
  });

  it('rejects an unknown appointment', () => {
    expect(
      codeOf(() =>
        planTransition(
          {
            appointmentId: 'appointment_404',
            transition: 'cancel',
            audit: { ...audit, actorId: 'a' },
            requestedAt: NOW,
            idempotency: idempotencyFor('a')
          },
          undefined,
          undefined
        )
      )
    ).toBe('APPOINTMENT_NOT_FOUND');
  });
});

describe('planDeletion', () => {
  const remove = (
    patch: Partial<AppointmentSnapshot> = {},
    auditPatch: Partial<AuditContext> = {},
    guard: PatientBookingGuardSnapshot | undefined = patientBookingGuard
  ) =>
    planDeletion(
      {
        appointmentId: appointment.id,
        audit: { ...audit, reasonCode: 'duplicate_record', ...auditPatch },
        requestedAt: NOW,
        idempotency: {
          ...idempotencyFor(),
          scope: `appointment:${appointment.id}:delete`
        }
      },
      { ...appointment, ...patch },
      guard
    );

  it('records the pre-delete state and no post state', () => {
    const plan = remove();
    expect(plan.deletedAt).toBe(NOW);
    expect(plan.auditEvent).toMatchObject({
      action: 'appointment_deleted',
      resourceId: appointment.id,
      before: { status: 'confirmed', slotId: appointment.slotId },
      after: null,
      reasonCode: 'duplicate_record',
      result: 'succeeded',
      schemaVersion: 2
    });
  });

  // 刪除不是生命週期的一步，而是清掉本來就不該存在的紀錄，因此任何狀態都
  // 可以刪——包含 planTransition 一律拒絕的三個終局狀態。
  it('deletes from every status, including the ones no transition can leave', () => {
    for (const status of [
      'confirmed',
      'cancellation_requested',
      'cancelled',
      'completed',
      'no_show'
    ] as AppointmentStatusValue[])
      expect(() => remove({ status })).not.toThrow();
  });

  // 已結束的預約早就把時段還出去了，再釋出一次會把後來訂走這格的人擠掉。
  it('releases the slot only while the appointment still holds one', () => {
    expect(remove().releaseSlotId).toBe(appointment.slotId);
    expect(remove({ status: 'cancellation_requested' }).releaseSlotId).toBe(
      appointment.slotId
    );
    for (const status of ['cancelled', 'completed', 'no_show'] as const)
      expect(remove({ status }).releaseSlotId).toBeUndefined();
  });

  it('always releases the patient booking guard', () => {
    expect(remove().patientBookingGuard).toEqual({
      action: 'release',
      activeAppointmentId: appointment.id
    });
  });

  // 紀錄消失後稽核事件是唯一證據，沒有理由的刪除等於無法複核。
  it('refuses a deletion with no reason code', () => {
    expect(codeOf(() => remove({}, { reasonCode: null }))).toBe(
      'INVALID_VALUE'
    );
  });

  it('cancels the same calendar event the appointment always used', () => {
    const plan = remove();
    expect(plan.outboxJob.appointmentStatus).toBe('deleted');
    expect(isCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(true);
    expect(fromCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(
      'calendar_appointment_001'
    );
    expect(plan.outboxJob.causationId).toBe(plan.auditEvent.eventId);
  });

  it('rejects an unknown appointment or a guard that belongs elsewhere', () => {
    expect(
      codeOf(() =>
        planDeletion(
          {
            appointmentId: 'appointment_404',
            audit: { ...audit, reasonCode: 'duplicate_record' },
            requestedAt: NOW,
            idempotency: idempotencyFor()
          },
          undefined,
          undefined
        )
      )
    ).toBe('APPOINTMENT_NOT_FOUND');
    expect(
      codeOf(() =>
        remove({}, {}, { ...patientBookingGuard, activeAppointmentId: 'other' })
      )
    ).toBe('PATIENT_BOOKING_GUARD_MISMATCH');
  });
});

describe('planReschedule', () => {
  const target: SlotSnapshot = {
    id: 'slot_20300102_1230',
    kind: 'initial',
    startsAt: '2030-01-02T04:30:00.000Z'
  };
  const reschedule = (
    slot: SlotSnapshot | undefined,
    patch: Partial<AppointmentSnapshot> = {}
  ) =>
    planReschedule(
      {
        appointmentId: 'appointment_001',
        targetSlotId: slot?.id ?? 'missing',
        audit,
        requestedAt: NOW,
        idempotency: {
          ...idempotencyFor(),
          scope: `appointment:${appointment.id}:reschedule`
        }
      },
      { ...appointment, ...patch },
      slot,
      patientBookingGuard
    );

  it('swaps the slots and returns to confirmed', () => {
    const plan = reschedule(target);
    expect(plan.releaseSlotId).toBe(appointment.slotId);
    expect(plan.reserveSlotId).toBe(target.id);
    expect(plan.startsAt).toBe(target.startsAt);
    expect(plan.nextStatus).toBe('confirmed');
    expect(plan.outboxJob).toMatchObject({
      correlationId: audit.correlationId,
      causationId: plan.auditEvent.eventId
    });
    expect(plan.patientBookingGuard).toEqual({
      action: 'retain',
      guard: {
        activeAppointmentId: appointment.id,
        status: 'confirmed',
        updatedAt: NOW
      }
    });
  });

  // 工作要能與原本的成立工作區分，否則會被當成同一筆而覆蓋；但日曆事件是
  // 同一個——改期是把事件搬到新時間，不是再開一格。
  it('keys the job to the new slot but the calendar event to the appointment', () => {
    const plan = reschedule(target);
    expect(plan.outboxJob.id).toContain(target.id);
    expect(fromCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(
      'calendar_appointment_001'
    );
    expect(isCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(true);
  });

  it('rejects a taken, missing or same slot', () => {
    expect(
      codeOf(() => reschedule({ ...target, reservationId: 'appointment_002' }))
    ).toBe('SLOT_UNAVAILABLE');
    expect(codeOf(() => reschedule(undefined))).toBe('SLOT_UNAVAILABLE');
    expect(
      codeOf(() => reschedule({ ...target, id: appointment.slotId }))
    ).toBe('INVALID_VALUE');
  });

  it('refuses to move an initial visit onto a follow-up slot', () => {
    expect(codeOf(() => reschedule({ ...target, kind: 'follow_up' }))).toBe(
      'BOOKING_KIND_MISMATCH'
    );
  });

  it('refuses to reschedule a finished appointment', () => {
    for (const status of ['cancelled', 'completed', 'no_show'] as const)
      expect(codeOf(() => reschedule(target, { status }))).toBe(
        'TRANSITION_NOT_ALLOWED'
      );
  });

  it('rejects a missing or mismatched patient booking guard', () => {
    const requestInput = {
      appointmentId: appointment.id,
      transition: 'cancel' as const,
      audit,
      requestedAt: NOW,
      idempotency: idempotencyFor()
    };

    expect(
      codeOf(() => planTransition(requestInput, appointment, undefined))
    ).toBe('PATIENT_BOOKING_GUARD_MISMATCH');
    expect(
      codeOf(() =>
        planTransition(requestInput, appointment, {
          ...patientBookingGuard,
          activeAppointmentId: 'appointment_other'
        })
      )
    ).toBe('PATIENT_BOOKING_GUARD_MISMATCH');
  });
});
