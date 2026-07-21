import { describe, expect, it } from 'vitest';

import { TestOnlyBookingService } from './test-only-booking.service.js';

describe('TestOnlyBookingService', () => {
  it('keeps booking data in memory and exposes no patient/contact fields', () => {
    const service = new TestOnlyBookingService();

    const initial = service.getSnapshot();
    expect(initial.appointments).toEqual([]);
    expect(initial.workload).toEqual([]);
    expect(initial.followUp).toEqual({ status: 'unknown' });
    expect(initial.slots).toHaveLength(2);

    const reserved = service.reserve('slot_test_001');
    expect(reserved.appointments).toHaveLength(1);
    expect(reserved.appointments[0]).toMatchObject({
      id: 'appointment_test_001',
      slotId: 'slot_test_001',
      status: 'confirmed'
    });
    expect('patientId' in reserved.appointments[0]).toBe(false);
    expect(reserved.outboxJobs[0]).toMatchObject({
      appointmentId: 'appointment_test_001',
      appointmentStatus: 'confirmed'
    });
    expect('patientId' in reserved.outboxJobs[0]).toBe(false);
  });

  it('supports synthetic completion, cancellation and reset', () => {
    const service = new TestOnlyBookingService();
    const first = service.reserve('slot_test_001');
    const firstAppointmentId = first.appointments[0]?.id;
    if (firstAppointmentId === undefined) throw new Error('Missing appointment.');

    const completed = service.complete(firstAppointmentId);
    expect(completed.appointments[0]).toMatchObject({ status: 'completed' });
    expect(completed.workload).toEqual([
      expect.objectContaining({
        managerId: 'manager_test_001',
        creditCount: 1,
        uniquePatientCount: 1
      })
    ]);

    const second = service.reserve('slot_test_002');
    const secondAppointmentId = second.appointments.find(
      (appointment) => appointment.slotId === 'slot_test_002'
    )?.id;
    if (secondAppointmentId === undefined) throw new Error('Missing appointment.');

    const cancelled = service.cancel(secondAppointmentId);
    expect(
      cancelled.appointments.find((appointment) => appointment.id === secondAppointmentId)
    ).toMatchObject({ status: 'cancellation_requested' });

    expect(service.reset().appointments).toEqual([]);
    expect(service.getSnapshot().workload).toEqual([]);
    expect(service.getSnapshot().followUp).toEqual({ status: 'unknown' });
  });

  it('records a synthetic staff follow-up decision without patient or clinical fields', () => {
    const service = new TestOnlyBookingService();
    const decision = service.setFollowUpDecision('required', '2030-01-15');

    expect(decision.followUp).toMatchObject({
      status: 'required',
      dueDate: '2030-01-15',
      decidedBy: 'actor_test_clinic_admin_001'
    });
    expect(JSON.stringify(decision.followUp)).not.toContain('patient_test_001');
    expect(() => service.setFollowUpDecision('not_required', '2030-01-15')).toThrow(
      'only allowed when follow-up is required'
    );
  });

  it('keeps a validated synthetic schedule only in memory', () => {
    const service = new TestOnlyBookingService();
    const updated = service.setSchedule({
      timeZone: 'Asia/Taipei',
      weeklyAvailability: [
        { weekday: 3, intervals: [{ startLocalTime: '10:00', endLocalTime: '14:00' }] }
      ],
      dateExceptions: [
        { date: '2030-01-10', kind: 'closed', reasonCode: 'REST_DAY' }
      ]
    });

    expect(updated.schedule.weeklyAvailability).toHaveLength(1);
    expect(updated.schedule.dateExceptions).toEqual([
      { date: '2030-01-10', kind: 'closed', reasonCode: 'REST_DAY' }
    ]);
    expect(service.reset().schedule.weeklyAvailability).toHaveLength(2);
  });

  it('does not count the same synthetic patient twice in one manager/month', () => {
    const service = new TestOnlyBookingService();
    const first = service.reserve('slot_test_001');
    const firstId = first.appointments[0]?.id;
    if (firstId === undefined) throw new Error('Missing first appointment.');
    service.complete(firstId);

    const second = service.reserve('slot_test_002');
    const secondId = second.appointments.find(
      (appointment) => appointment.slotId === 'slot_test_002'
    )?.id;
    if (secondId === undefined) throw new Error('Missing second appointment.');
    const completed = service.complete(secondId);

    expect(completed.workload).toEqual([
      expect.objectContaining({
        managerId: 'manager_test_001',
        creditCount: 1,
        uniquePatientCount: 1
      })
    ]);
    expect(JSON.stringify(completed.workload)).not.toContain('patient_test_001');
  });
});
