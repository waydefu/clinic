import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';
import { CalendarPilotSessionController } from '../auth/calendar-pilot-session.controller.js';
import { FirestoreCalendarPilotRepository } from '../firestore/calendar-pilot.repository.js';
import { FirestoreDeniedAccessAuditStore } from '../firestore/denied-access-audit.repository.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { DENIED_AUTHORIZATION_AUDIT } from '../platform/authorization/denied-access-audit.port.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
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
      useFactory: (repository: FirestoreCalendarPilotRepository) =>
        new CalendarPilotApplicationService(repository, {
          nowUtc: () => new Date().toISOString()
        })
    },
    {
      provide: DENIED_AUTHORIZATION_AUDIT,
      useFactory: () =>
        new FirestoreDeniedAccessAuditStore(getFirestore(defaultFirebaseApp()))
    },
    CalendarPilotSessionGuard,
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ],
  exports: [CALENDAR_PILOT_SESSIONS]
})
export class CalendarPilotModule {}
