import { Module } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';
import { CalendarPilotSessionController } from '../auth/calendar-pilot-session.controller.js';
import { createCalendarPilotSessionGateTelemetry } from '../auth/calendar-pilot-session-gate-telemetry.js';
import { FirestoreCalendarPilotRepository } from '../firestore/calendar-pilot.repository.js';
import { FirestoreBookingRepository } from '../firestore/booking.repository.js';
import { FirestoreClinicCalendarCandidateStore } from '../firestore/clinic-calendar-review.repository.js';
import { ObservabilityModule } from '../platform/runtime/observability.module.js';
import {
  STRUCTURED_LOGGER,
  type StructuredLogger
} from '../platform/runtime/structured-logger.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import { ClinicCalendarReviewApplicationService } from './clinic-calendar-review.application-service.js';
import { CalendarPilotController } from './calendar-pilot.controller.js';
import {
  CALENDAR_PILOT_APPLICATION,
  CALENDAR_PILOT_REPOSITORY,
  CALENDAR_PILOT_SESSIONS
} from './calendar-pilot.tokens.js';

import { ApiSafetyModule } from '../firestore/api-safety.module.js';
import {
  defaultFirebaseApp,
  vitestWithoutFirestoreEmulator
} from '../platform/runtime/firebase-admin-app.js';
export { defaultFirebaseApp, vitestWithoutFirestoreEmulator };

@Module({
  imports: [ObservabilityModule, ApiSafetyModule],
  controllers: [CalendarPilotSessionController, CalendarPilotController],
  providers: [
    {
      provide: CALENDAR_PILOT_REPOSITORY,
      useFactory: () =>
        new FirestoreCalendarPilotRepository(getFirestore(defaultFirebaseApp()))
    },
    {
      provide: CALENDAR_PILOT_SESSIONS,
      inject: [STRUCTURED_LOGGER],
      useFactory: (logger: StructuredLogger) => {
        const app = defaultFirebaseApp();
        return new CalendarPilotSessionService(
          getAuth(app),
          getFirestore(app),
          process.env,
          createCalendarPilotSessionGateTelemetry(logger),
          // Usage ingress is independent of the report routes gate. A valid
          // maintenance allowlist is required to classify staff logins; when
          // it is absent or invalid, sessions still work and a monthly gap
          // marker is written without a login event or first-use milestone
          // (ADR-0008).
          true
        );
      }
    },
    {
      provide: CALENDAR_PILOT_APPLICATION,
      inject: [CALENDAR_PILOT_REPOSITORY],
      useFactory: (repository: FirestoreCalendarPilotRepository) => {
        const clock = { nowUtc: () => new Date().toISOString() };
        if (vitestWithoutFirestoreEmulator()) {
          return new CalendarPilotApplicationService(repository, clock);
        }
        const db = getFirestore(defaultFirebaseApp());
        const clinicReview = new ClinicCalendarReviewApplicationService(
          new FirestoreClinicCalendarCandidateStore(
            db,
            new FirestoreBookingRepository(db)
          ),
          clock.nowUtc
        );
        return new CalendarPilotApplicationService(
          repository,
          clock,
          clinicReview
        );
      }
    },
    CalendarPilotSessionGuard
  ],
  exports: [CALENDAR_PILOT_SESSIONS]
})
export class CalendarPilotModule {}
