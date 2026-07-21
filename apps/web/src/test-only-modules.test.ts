import { describe, expect, it } from 'vitest';
import {
  createBooking,
  transitionAppointment
} from '../public/modules/appointment-domain.js';
import {
  assignCaseManager,
  buildWorkload
} from '../public/modules/case-management.js';
import {
  generateSlots,
  scheduleImpact
} from '../public/modules/schedule-engine.js';
import { initialState } from '../public/modules/state-schema.js';

describe('modular synthetic schedule engine', () => {
  it('derives patient slots from the published weekly schedule', () => {
    const state = initialState();
    const mondaySlots = state.slots.filter((slot) =>
      slot.id.startsWith('slot_20300107_')
    );
    expect(mondaySlots).toHaveLength(6);
    expect(mondaySlots[0]?.startsAt).toBe('2030-01-07T01:00:00.000Z');
  });

  it('detects published schedule changes that would remove an active booking', () => {
    const state = initialState();
    createBooking(
      state,
      {
        slotId: state.slots[0]!.id,
        patientId: 'patient_test_001',
        bookingType: 'initial'
      },
      'admin_test_001'
    );
    const emptySchedule = {
      timeZone: 'Asia/Taipei',
      weeklyAvailability: [],
      dateExceptions: []
    };
    expect(
      scheduleImpact(
        state.appointments,
        generateSlots(emptySchedule, state.slots)
      )
    ).toHaveLength(1);
  });
});

describe('modular synthetic case workload', () => {
  it('counts distinct patients and visits after completion and assignment', () => {
    const state = initialState();
    createBooking(
      state,
      {
        slotId: state.slots[0]!.id,
        patientId: 'patient_test_001',
        bookingType: 'initial'
      },
      'admin_test_001'
    );
    createBooking(
      state,
      {
        slotId: state.slots[1]!.id,
        patientId: 'patient_test_002',
        bookingType: 'initial'
      },
      'admin_test_001'
    );
    for (const appointment of state.appointments) {
      transitionAppointment(
        state,
        appointment.id,
        'complete',
        'front_desk_test_001'
      );
      assignCaseManager(
        state,
        appointment.id,
        'manager_test_001',
        'admin_test_001'
      );
    }
    const workload = buildWorkload(state);
    expect(workload).toHaveLength(1);
    expect(workload[0]).toMatchObject({
      uniquePatientCount: 2,
      visitCount: 2,
      creditCount: 2
    });
  });
});
