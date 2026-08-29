import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { CalendarPilotSessionService } from '../auth/calendar-pilot-session.js';
import { CalendarPilotSessionController } from '../auth/calendar-pilot-session.controller.js';
import { FirestoreCalendarPilotRepository } from '../firestore/calendar-pilot.repository.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import { CalendarPilotController } from './calendar-pilot.controller.js';
import {
  CALENDAR_PILOT_APPLICATION,
  CALENDAR_PILOT_REPOSITORY,
  CALENDAR_PILOT_SESSIONS
} from './calendar-pilot.tokens.js';

if (getApps().length === 0) initializeApp();
const firestore = getFirestore();
const firebaseAuth = getAuth();

@Module({
  controllers: [CalendarPilotSessionController, CalendarPilotController],
  providers: [
    {
      provide: CALENDAR_PILOT_REPOSITORY,
      useFactory: () => new FirestoreCalendarPilotRepository(firestore)
    },
    {
      provide: CALENDAR_PILOT_SESSIONS,
      useFactory: () =>
        new CalendarPilotSessionService(firebaseAuth, firestore, process.env)
    },
    {
      provide: CALENDAR_PILOT_APPLICATION,
      inject: [CALENDAR_PILOT_REPOSITORY],
      useFactory: (repository: FirestoreCalendarPilotRepository) =>
        new CalendarPilotApplicationService(repository, {
          nowUtc: () => new Date().toISOString()
        })
    },
    CalendarPilotSessionGuard,
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
export class CalendarPilotModule {}
