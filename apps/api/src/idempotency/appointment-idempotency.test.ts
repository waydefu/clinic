import { describe, expect, it } from 'vitest';

import {
  createAppointmentIdempotency,
  rescheduleAppointmentIdempotency,
  transitionAppointmentIdempotency
} from './appointment-idempotency.js';

const createInput = {
  key: 'booking_request_0001',
  actorId: 'actor_front_desk_001',
  patientId: 'patient_001',
  slotId: 'slot_001',
  bookingKind: 'initial' as const,
  itemId: 'service_consult'
};

describe('appointment idempotency hashing', () => {
  it('is stable for the same semantic create request', () => {
    expect(createAppointmentIdempotency(createInput)).toEqual(
      createAppointmentIdempotency(createInput)
    );
  });

  it('changes the request hash but not record ID when content changes', () => {
    const first = createAppointmentIdempotency(createInput);
    const changed = createAppointmentIdempotency({
      ...createInput,
      slotId: 'slot_002'
    });

    expect(changed.recordId).toBe(first.recordId);
    expect(changed.requestHash).not.toBe(first.requestHash);
  });

  it('separates the same raw key by actor and operation scope', () => {
    const create = createAppointmentIdempotency(createInput);
    const otherActor = createAppointmentIdempotency({
      ...createInput,
      actorId: 'actor_front_desk_002'
    });
    const transition = transitionAppointmentIdempotency({
      key: createInput.key,
      actorId: createInput.actorId,
      appointmentId: 'appointment_001',
      transition: 'cancel'
    });
    const reschedule = rescheduleAppointmentIdempotency({
      key: createInput.key,
      actorId: createInput.actorId,
      appointmentId: 'appointment_001',
      targetSlotId: 'slot_002'
    });

    expect(
      new Set([
        create.recordId,
        otherActor.recordId,
        transition.recordId,
        reschedule.recordId
      ]).size
    ).toBe(4);
  });
});
