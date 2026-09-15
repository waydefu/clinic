import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';
import { CalendarPilotSessionController } from '../auth/calendar-pilot-session.controller.js';
import { FirestoreCalendarPilotRepository } from '../firestore/calendar-pilot.repository.js';
import { FirestoreBookingRepository } from '../firestore/booking.repository.js';
import {
  FirestoreClinicCalendarCandidateStore,
  FirestoreClinicSlotLookup
} from '../firestore/clinic-calendar-review.repository.js';
import { FirestoreDeniedAccessAuditStore } from '../firestore/denied-access-audit.repository.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import {
  DENIED_AUTHORIZATION_AUDIT,
  InMemoryDeniedAccessAuditSink
} from '../platform/authorization/denied-access-audit.port.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import { ClinicCalendarReviewApplicationService } from './clinic-calendar-review.application-service.js';
import { CalendarPilotController } from './calendar-pilot.controller.js';
import {
  CALENDAR_PILOT_APPLICATION,
  CALENDAR_PILOT_REPOSITORY,
  CALENDAR_PILOT_SESSIONS
} from './calendar-pilot.tokens.js';

/**
 * Resolve the default Admin app only when a Nest factory first needs it.
 * Import-time `initializeApp()` raced emulator suites that create a named
 * app first, then called `getFirestore()` with no default app.
 */
export function defaultFirebaseApp(): App {
  if (getApps().some((app) => app.name === '[DEFAULT]')) return getApp();
  return initializeApp();
}

export function vitestWithoutFirestoreEmulator(): boolean {
  return (
    process.env['VITEST'] !== undefined &&
    process.env['FIRESTORE_EMULATOR_HOST'] === undefined
  );
}

@Module({
  controllers: [CalendarPilotSessionController, CalendarPilotController],
  providers: [
    {
      provide: CALENDAR_PILOT_REPOSITORY,
      useFactory: () =>
        new FirestoreCalendarPilotRepository(getFirestore(defaultFirebaseApp()))
    },
    {
      provide: CALENDAR_PILOT_SESSIONS,
      useFactory: () => {
        const app = defaultFirebaseApp();
        return new CalendarPilotSessionService(
          getAuth(app),
          getFirestore(app),
          process.env
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
          new FirestoreBookingRepository(db),
          new FirestoreClinicCalendarCandidateStore(db),
          new FirestoreClinicSlotLookup(db),
          clock.nowUtc
        );
        return new CalendarPilotApplicationService(
          repository,
          clock,
          clinicReview
        );
      }
    },
    {
      provide: DENIED_AUTHORIZATION_AUDIT,
      useFactory: () => {
        // Vitest AppModule proofs boot without ADC. A fire-and-forget
        // Firestore create() then rejects unhandled and fails the suite.
        if (vitestWithoutFirestoreEmulator()) {
          return new InMemoryDeniedAccessAuditSink();
        }
        return new FirestoreDeniedAccessAuditStore(
          getFirestore(defaultFirebaseApp())
        );
      }
    },
    CalendarPilotSessionGuard,
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ],
  exports: [CALENDAR_PILOT_SESSIONS]
})
export class CalendarPilotModule {}
