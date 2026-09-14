import { Module, type DynamicModule } from '@nestjs/common';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  isRole,
  UNPUBLISHED_SCHEDULE,
  type PublishedScheduleSnapshot,
  type SchedulePublicationRequest,
  type SlotSnapshot
} from '@beauessence/domain';

import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  APPOINTMENT_AUTHORIZATION,
  AppointmentController
} from '../appointments/appointment.controller.js';
import { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import type { AppointmentAuthorizationPolicy } from '../appointments/appointment.policy.js';
import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  CalendarPilotModule,
  defaultFirebaseApp
} from '../calendar/calendar-pilot.module.js';
import { CALENDAR_PILOT_SESSIONS } from '../calendar/calendar-pilot.tokens.js';
import { FirestoreBookingRepository } from '../firestore/booking.repository.js';
import { FirestoreDurableRateLimitStore } from '../firestore/rate-limit.repository.js';
import { FirestorePatientDirectory } from '../patients/patient-directory.js';
import { FirestoreScheduleRepository } from '../firestore/schedule.repository.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import {
  createRbacAppointmentPolicy,
  createScheduleAuthorizationPolicy
} from '../platform/authorization/rbac-appointment-policy.js';
import {
  AuthorizationDeniedError,
  ServiceUnavailableError
} from '../platform/errors/api-error.js';
import {
  InMemoryDurableRateLimitStore,
  type DurableRateLimitStore
} from '../platform/runtime/durable-rate-limit-store.js';
import {
  RATE_LIMIT_STORE,
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';
import {
  SCHEDULE_APPLICATION,
  ScheduleController
} from '../schedule/schedule.controller.js';
import { ScheduleApplicationService } from '../schedule/schedule.application-service.js';
import type { ScheduleAuthorizationPolicy } from '../schedule/schedule.policy.js';
import type {
  PublishedScheduleResult,
  ScheduleRepositoryPort
} from '../schedule/schedule.repository-port.js';
import { ReturnLookupController } from './return-lookup.controller.js';
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

function vitestWithoutFirestoreEmulator(): boolean {
  return (
    process.env['VITEST'] !== undefined &&
    process.env['FIRESTORE_EMULATOR_HOST'] === undefined
  );
}

function unpublishedMemorySchedule(): ScheduleRepositoryPort {
  return {
    readPublished: (): Promise<PublishedScheduleSnapshot> =>
      Promise.resolve(UNPUBLISHED_SCHEDULE),
    listOccupiedSlots: (): Promise<readonly SlotSnapshot[]> =>
      Promise.resolve([]),
    publish: (
      _request: SchedulePublicationRequest
    ): Promise<PublishedScheduleResult> =>
      Promise.reject(new ServiceUnavailableError())
  };
}

export interface InternalTestBookingModuleOptions {
  readonly clock?: InternalTestBookingClock;
  readonly auth?: Auth;
  readonly sessions?: CalendarPilotSessionService;
}

/**
 * IP-001 composing module. Fail-closed: default env refuses writes with 503.
 * Public production `/v1/bookings` is not authorised. Do not import
 * `AppointmentController` from `AppModule` except through this module.
 *
 * `register()` is the production compose. Emulator suites pass a shared
 * clock and the CAL-PILOT session/Auth ports so occupancy proofs boot this
 * module with `InternalTestBookingAuthenticator` instead of a header harness.
 */
@Module({})
export class InternalTestBookingModule {
  public static register(
    options: InternalTestBookingModuleOptions = {}
  ): DynamicModule {
    return {
      module: InternalTestBookingModule,
      imports: [CalendarPilotModule],
      controllers: [
        AppointmentController,
        ScheduleController,
        ReturnLookupController
      ],
      providers: [
        {
          provide: INTERNAL_TEST_BOOKING_SETTINGS,
          useFactory: () => internalTestBookingSettingsFromEnv()
        },
        {
          provide: INTERNAL_TEST_BOOKING_CLOCK,
          useValue: options.clock ?? {
            nowUtc: () => new Date().toISOString()
          }
        },
        {
          provide: RATE_LIMIT_STORE,
          useFactory: () => {
            // Vitest AppModule proofs boot without ADC or an emulator.
            // Durable consume must not call Cloud Firestore there.
            // Production and emulator suites keep the Firestore store.
            if (vitestWithoutFirestoreEmulator()) {
              return new InMemoryDurableRateLimitStore();
            }
            return new FirestoreDurableRateLimitStore(
              getFirestore(defaultFirebaseApp())
            );
          }
        },
        {
          provide: WP_B2_RATE_LIMITER,
          inject: [RATE_LIMIT_STORE],
          useFactory: (store: DurableRateLimitStore) =>
            new WpB2RateLimiter(store)
        },
        {
          provide: 'PatientDirectory',
          useFactory: () =>
            new FirestorePatientDirectory(getFirestore(defaultFirebaseApp()))
        },
        {
          provide: APPOINTMENT_AUTHORIZATION,
          useFactory: () => createRbacAppointmentPolicy(resolveRole)
        },
        {
          provide: SCHEDULE_AUTHORIZATION,
          useFactory: () => createScheduleAuthorizationPolicy(resolveRole)
        },
        options.auth !== undefined && options.sessions !== undefined
          ? {
              provide: APPOINTMENT_AUTHENTICATOR,
              inject: ['PatientDirectory', INTERNAL_TEST_BOOKING_CLOCK],
              useFactory: (
                patients: FirestorePatientDirectory,
                clock: InternalTestBookingClock
              ) =>
                new InternalTestBookingAuthenticator(
                  options.sessions as CalendarPilotSessionService,
                  options.auth as Auth,
                  patients,
                  () => clock.nowUtc()
                )
            }
          : {
              provide: APPOINTMENT_AUTHENTICATOR,
              inject: [
                CALENDAR_PILOT_SESSIONS,
                'PatientDirectory',
                INTERNAL_TEST_BOOKING_CLOCK
              ],
              useFactory: (
                sessions: CalendarPilotSessionService,
                patients: FirestorePatientDirectory,
                clock: InternalTestBookingClock
              ) =>
                new InternalTestBookingAuthenticator(
                  sessions,
                  getAuth(defaultFirebaseApp()),
                  patients,
                  () => clock.nowUtc()
                )
            },
        {
          provide: APPOINTMENT_APPLICATION,
          inject: [
            APPOINTMENT_AUTHORIZATION,
            INTERNAL_TEST_BOOKING_CLOCK,
            'PatientDirectory'
          ],
          useFactory: (
            authorization: AppointmentAuthorizationPolicy,
            clock: InternalTestBookingClock,
            patients: FirestorePatientDirectory
          ) =>
            new AppointmentApplicationService(
              new FirestoreBookingRepository(
                getFirestore(defaultFirebaseApp())
              ),
              authorization,
              { next: opaqueBookingId },
              clock,
              { next: opaqueBookingId },
              patients
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
              vitestWithoutFirestoreEmulator()
                ? unpublishedMemorySchedule()
                : new FirestoreScheduleRepository(
                    getFirestore(defaultFirebaseApp())
                  ),
              authorization,
              clock,
              { next: opaqueBookingId }
            )
        }
      ]
    };
  }
}
