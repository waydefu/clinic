import { Injectable } from '@nestjs/common';
import {
  type AvailabilitySlot,
  type MonthlyManagerWorkload,
  type PayrollCredit,
  type TestOnlyBookingPolicy,
  type TestOnlyBookingState,
  type TestOnlyFollowUpDecision,
  type TestOnlySchedule,
  completeTestOnlyAppointment,
  createPayrollCredit,
  createTestOnlyBookingState,
  requestTestOnlyCancellation,
  reserveTestOnlyAppointment,
  initialTestOnlyFollowUpDecision,
  setTestOnlyFollowUpDecision,
  createTestOnlySchedule,
  summarizeMonthlyManagerWorkload
} from '@beauessence/domain';

const testOnlyPolicy: TestOnlyBookingPolicy = {
  policyVersion: 'privacy-v1',
  serviceId: 'service_test_consult',
  allowedCreateActorRoles: ['test_patient', 'test_front_desk'],
  allowedCancellationActorRoles: ['test_patient', 'test_front_desk'],
  allowedCompletionActorRoles: [
    'test_front_desk',
    'test_clinic_admin',
    'test_system'
  ]
};

const testOnlySlots: readonly AvailabilitySlot[] = [
  {
    id: 'slot_test_001',
    startsAt: '2030-01-02T01:00:00Z',
    endsAt: '2030-01-02T01:30:00Z'
  },
  {
    id: 'slot_test_002',
    startsAt: '2030-01-02T01:30:00Z',
    endsAt: '2030-01-02T02:00:00Z'
  }
];

const testOnlySchedule: TestOnlySchedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [
    {
      weekday: 1,
      intervals: [{ startLocalTime: '09:00', endLocalTime: '12:00' }]
    },
    {
      weekday: 2,
      intervals: [{ startLocalTime: '13:00', endLocalTime: '17:00' }]
    }
  ],
  dateExceptions: []
};

export interface TestOnlyBookingSnapshot {
  readonly policyVersion: string;
  readonly serviceId: string;
  readonly slots: readonly AvailabilitySlot[];
  readonly appointments: readonly {
    readonly id: string;
    readonly slotId: string;
    readonly serviceId: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
  readonly workload: readonly MonthlyManagerWorkload[];
  readonly followUp: TestOnlyFollowUpDecision;
  readonly schedule: TestOnlySchedule;
  readonly auditEvents: TestOnlyBookingState['auditEvents'];
  readonly outboxJobs: TestOnlyBookingState['outboxJobs'];
}

/**
 * Synthetic only. This service owns an in-memory state model and is loaded
 * only by an explicit local development environment flag.
 */
@Injectable()
export class TestOnlyBookingService {
  private state = createTestOnlyBookingState(testOnlySlots);
  private syntheticWorkloadCreditsById: Readonly<Record<string, PayrollCredit>> = {};
  private followUp = initialTestOnlyFollowUpDecision();
  private schedule = createTestOnlySchedule(testOnlySchedule);
  private sequence = 1;

  public getSnapshot(): TestOnlyBookingSnapshot {
    return {
      policyVersion: testOnlyPolicy.policyVersion,
      serviceId: testOnlyPolicy.serviceId,
      slots: Object.values(this.state.slotsById),
      appointments: Object.values(this.state.appointmentsById).map(
        (appointment) => ({
          id: appointment.id,
          slotId: appointment.slotId,
          serviceId: appointment.serviceId,
          status: appointment.status,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt
        })
      ),
      workload: summarizeMonthlyManagerWorkload(
        Object.values(this.syntheticWorkloadCreditsById)
      ),
      followUp: this.followUp,
      schedule: this.schedule,
      auditEvents: this.state.auditEvents,
      outboxJobs: this.state.outboxJobs
    };
  }

  public reserve(slotId: string): TestOnlyBookingSnapshot {
    const suffix = this.nextSuffix();
    const now = new Date().toISOString();
    const result = reserveTestOnlyAppointment(this.state, testOnlyPolicy, {
      idempotencyKey: `booking_test_request_${suffix}`,
      appointmentId: `appointment_test_${suffix}`,
      patientId: 'patient_test_001',
      slotId,
      serviceId: testOnlyPolicy.serviceId,
      actor: { id: 'actor_test_patient_001', role: 'test_patient' },
      requestedAt: now,
      privacyAcceptance: {
        policyVersion: testOnlyPolicy.policyVersion,
        acceptedAt: now
      }
    });

    this.state = result.state;
    return this.getSnapshot();
  }

  public cancel(appointmentId: string): TestOnlyBookingSnapshot {
    const appointment = this.state.appointmentsById[appointmentId];
    if (appointment === undefined) {
      throw new Error('Synthetic appointment not found.');
    }
    const slot = this.state.slotsById[appointment.slotId];
    if (slot === undefined) {
      throw new Error('Synthetic appointment slot not found.');
    }

    const result = requestTestOnlyCancellation(this.state, testOnlyPolicy, {
      idempotencyKey: `cancel_test_request_${this.nextSuffix()}`,
      appointmentId,
      actor: { id: 'actor_test_patient_001', role: 'test_patient' },
      requestedAt: new Date().toISOString(),
      cancellationCutoffAt: new Date(
        Date.parse(slot.startsAt) - 24 * 60 * 60 * 1000
      ).toISOString()
    });

    this.state = result.state;
    return this.getSnapshot();
  }

  public complete(appointmentId: string): TestOnlyBookingSnapshot {
    const result = completeTestOnlyAppointment(this.state, testOnlyPolicy, {
      idempotencyKey: `complete_test_request_${this.nextSuffix()}`,
      appointmentId,
      actor: { id: 'actor_test_front_desk_001', role: 'test_front_desk' },
      completedAt: new Date().toISOString()
    });

    const completedAppointment = result.state.appointmentsById[appointmentId];
    if (completedAppointment === undefined) {
      throw new Error('Completed synthetic appointment not found.');
    }

    const workloadCredit = createPayrollCredit({
      appointment: completedAppointment,
      assignment: {
        patientId: completedAppointment.patientId,
        managerId: 'manager_test_001',
        activeFrom: '2020-01-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });

    this.syntheticWorkloadCreditsById = {
      ...this.syntheticWorkloadCreditsById,
      [workloadCredit.id]: workloadCredit
    };
    this.state = result.state;
    return this.getSnapshot();
  }

  public reset(): TestOnlyBookingSnapshot {
    this.state = createTestOnlyBookingState(testOnlySlots);
    this.syntheticWorkloadCreditsById = {};
    this.followUp = initialTestOnlyFollowUpDecision();
    this.schedule = createTestOnlySchedule(testOnlySchedule);
    this.sequence = 1;
    return this.getSnapshot();
  }

  public setSchedule(schedule: TestOnlySchedule): TestOnlyBookingSnapshot {
    this.schedule = createTestOnlySchedule(schedule);
    return this.getSnapshot();
  }

  public setFollowUpDecision(
    status: 'required' | 'not_required',
    dueDate?: string
  ): TestOnlyBookingSnapshot {
    const result = setTestOnlyFollowUpDecision(this.followUp, {
      status,
      ...(dueDate === undefined ? {} : { dueDate }),
      actor: { id: 'actor_test_clinic_admin_001', role: 'test_clinic_admin' },
      decidedAt: new Date().toISOString()
    });
    this.followUp = result.decision;
    return this.getSnapshot();
  }

  private nextSuffix(): string {
    const suffix = this.sequence.toString().padStart(3, '0');
    this.sequence += 1;
    return suffix;
  }
}
