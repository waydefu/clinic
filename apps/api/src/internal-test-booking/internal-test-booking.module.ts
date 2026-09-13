import { Module } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { isRole } from '@beauessence/domain';

import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  APPOINTMENT_AUTHORIZATION,
  AppointmentController
} from '../appointments/appointment.controller.js';
import { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import type { AppointmentAuthorizationPolicy } from '../appointments/appointment.policy.js';
import type { AuthenticationContext } from '../auth/authentication-context.js';
import { CalendarPilotModule } from '../calendar/calendar-pilot.module.js';
import { CALENDAR_PILOT_SESSIONS } from '../calendar/calendar-pilot.tokens.js';
import { FirestoreBookingRepository } from '../firestore/booking.repository.js';
import { FirestoreScheduleRepository } from '../firestore/schedule.repository.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import {
  createRbacAppointmentPolicy,
  createScheduleAuthorizationPolicy
} from '../platform/authorization/rbac-appointment-policy.js';
import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import {
  SCHEDULE_APPLICATION,
  ScheduleController
} from '../schedule/schedule.controller.js';
import { ScheduleApplicationService } from '../schedule/schedule.application-service.js';
import type { ScheduleAuthorizationPolicy } from '../schedule/schedule.policy.js';
import { InternalTestBookingAuthenticator } from './internal-test-booking.authenticator.js';
import { internalTestBookingSettingsFromEnv } from './internal-test-booking.gate.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS,
  opaqueBookingId,
  type InternalTestBookingClock
} from './internal-test-booking.tokens.js';
import type { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';

const SCHEDULE_AUTHORIZATION = 'ScheduleAuthorizationPolicy';

function resolveRole(context: AuthenticationContext): CandidateRole {
  if (!isRole(context.actorRole)) throw new AuthorizationDeniedError();
  return context.actorRole;
}

/**
 * IP-001 composing module. Fail-closed: default env refuses writes with 503.
 * Public production `/v1/bookings` is not authorised. Do not import
 * `AppointmentController` from `AppModule` except through this module.
 */
@Module({
  imports: [CalendarPilotModule],
  controllers: [AppointmentController, ScheduleController],
  providers: [
    {
      provide: INTERNAL_TEST_BOOKING_SETTINGS,
      useFactory: () => internalTestBookingSettingsFromEnv()
    },
    {
      provide: INTERNAL_TEST_BOOKING_CLOCK,
      useValue: { nowUtc: () => new Date().toISOString() }
    },
    {
      provide: APPOINTMENT_AUTHORIZATION,
      useFactory: () => createRbacAppointmentPolicy(resolveRole)
    },
    {
      provide: SCHEDULE_AUTHORIZATION,
      useFactory: () => createScheduleAuthorizationPolicy(resolveRole)
    },
    {
      provide: APPOINTMENT_AUTHENTICATOR,
      inject: [CALENDAR_PILOT_SESSIONS],
      useFactory: (sessions: CalendarPilotSessionService) =>
        new InternalTestBookingAuthenticator(sessions, getAuth())
    },
    {
      provide: APPOINTMENT_APPLICATION,
      inject: [APPOINTMENT_AUTHORIZATION, INTERNAL_TEST_BOOKING_CLOCK],
      useFactory: (
        authorization: AppointmentAuthorizationPolicy,
        clock: InternalTestBookingClock
      ) =>
        new AppointmentApplicationService(
          new FirestoreBookingRepository(getFirestore()),
          authorization,
          { next: opaqueBookingId },
          clock,
          { next: opaqueBookingId }
        )
    },
    {
      provide: SCHEDULE_APPLICATION,
      inject: [SCHEDULE_AUTHORIZATION, INTERNAL_TEST_BOOKING_CLOCK],
      useFactory: (
        authorization: ScheduleAuthorizationPolicy,
        clock: InternalTestBookingClock
      ) =>
        new ScheduleApplicationService(
          new FirestoreScheduleRepository(getFirestore()),
          authorization,
          clock,
          { next: opaqueBookingId }
        )
    }
  ]
})
export class InternalTestBookingModule {}
