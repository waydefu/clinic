import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  AppointmentController
} from '../appointments/appointment.controller.js';
import { CalendarPilotSessionController } from '../auth/calendar-pilot-session.controller.js';
import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { BusinessDeliveryController } from '../business-delivery/business-delivery.controller.js';
import { BusinessDeliveryModule } from '../business-delivery/business-delivery.module.js';
import { BusinessExportController } from '../business-delivery/business-export.controller.js';
import { BusinessRetentionController } from '../business-delivery/business-retention.controller.js';
import { BusinessTerminationController } from '../business-delivery/business-termination.controller.js';
import { CalendarPilotController } from '../calendar/calendar-pilot.controller.js';
import { CalendarPilotModule } from '../calendar/calendar-pilot.module.js';
import { ApiSafetyModule } from '../firestore/api-safety.module.js';
import { HealthController } from '../health.controller.js';
import { ObservabilityModule } from '../platform/runtime/observability.module.js';
import { WP_B2_RATE_LIMITER } from '../platform/runtime/wp-b2-rate-limiter.js';
import { ScheduleController } from '../schedule/schedule.controller.js';
import { InternalTestBookingModule } from './internal-test-booking.module.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from './internal-test-booking.tokens.js';
import { ReturnLookupController } from './return-lookup.controller.js';

const source = readFileSync(
  new URL('./internal-test-booking.module.ts', import.meta.url),
  'utf8'
);
const appModule = readFileSync(
  new URL('../app.module.ts', import.meta.url),
  'utf8'
);

describe('InternalTestBookingModule clock wiring', () => {
  it('uses one INTERNAL_TEST_BOOKING_CLOCK for the gate, bookings, and grid', () => {
    expect(source).toMatch(
      /inject:\s*\[\s*APPOINTMENT_AUTHORIZATION,\s*INTERNAL_TEST_BOOKING_CLOCK,\s*'PatientDirectory'\s*\]/s
    );
    expect(source).toMatch(
      /inject:\s*\[\s*SCHEDULE_AUTHORIZATION,\s*INTERNAL_TEST_BOOKING_CLOCK\s*\]/s
    );
    expect(source.match(/new Date\(\)\.toISOString\(\)/g)).toEqual([
      'new Date().toISOString()'
    ]);
  });

  it('keeps the production authenticator on CAL-PILOT sessions', () => {
    expect(source).toMatch(
      /inject:\s*\[\s*CALENDAR_PILOT_SESSIONS,\s*'PatientDirectory',\s*INTERNAL_TEST_BOOKING_CLOCK\s*\]/s
    );
    expect(appModule).toMatch(/InternalTestBookingModule\.register\(\)/);
  });

  it('keeps Vitest AppModule slot reads on an unpublished in-memory grid', () => {
    expect(source).toContain('unpublishedMemorySchedule');
    expect(source).toContain('vitestWithoutFirestoreEmulator');
    expect(source).toContain('FirestoreScheduleRepository');
  });
});

@Module({
  controllers: [ReturnLookupController],
  providers: [
    { provide: APPOINTMENT_APPLICATION, useValue: {} },
    { provide: APPOINTMENT_AUTHENTICATOR, useValue: {} },
    { provide: INTERNAL_TEST_BOOKING_SETTINGS, useValue: {} },
    { provide: INTERNAL_TEST_BOOKING_CLOCK, useValue: {} }
  ]
})
class ReturnLookupMissingLimiterModule {}

function readApiFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('E4-14 staff session and limiter module composition', () => {
  it('routes every mounted staff controller through CalendarPilotSessionService', () => {
    const appImports = Reflect.getMetadata('imports', AppModule) as unknown[];
    const bookingDynamic = appImports.find(
      (entry): entry is DynamicModule =>
        typeof entry === 'object' &&
        entry !== null &&
        'module' in entry &&
        entry.module === InternalTestBookingModule
    );
    expect(bookingDynamic).toBeDefined();
    expect(Reflect.getMetadata('controllers', AppModule)).toEqual([
      HealthController
    ]);
    expect(appImports).toEqual(
      expect.arrayContaining([
        ObservabilityModule,
        ApiSafetyModule,
        CalendarPilotModule,
        BusinessDeliveryModule
      ])
    );
    expect(appImports).toHaveLength(5);
    for (const moduleClass of [ObservabilityModule, ApiSafetyModule]) {
      expect(Reflect.getMetadata('controllers', moduleClass)).toBeUndefined();
    }

    expect(Reflect.getMetadata('controllers', CalendarPilotModule)).toEqual([
      CalendarPilotSessionController,
      CalendarPilotController
    ]);
    expect(
      Reflect.getMetadata('__guards__', CalendarPilotController)
    ).toContain(CalendarPilotSessionGuard);

    const businessControllers = [
      BusinessDeliveryController,
      BusinessExportController,
      BusinessRetentionController,
      BusinessTerminationController
    ];
    expect(Reflect.getMetadata('controllers', BusinessDeliveryModule)).toEqual(
      businessControllers
    );
    for (const controller of businessControllers) {
      expect(Reflect.getMetadata('__guards__', controller)).toContain(
        CalendarPilotSessionGuard
      );
    }

    expect(bookingDynamic?.controllers).toEqual([
      AppointmentController,
      ScheduleController,
      ReturnLookupController
    ]);
    expect(bookingDynamic?.imports).toEqual([
      CalendarPilotModule,
      ApiSafetyModule
    ]);
    const guardSource = readApiFile('../auth/calendar-pilot.guard.ts');
    expect(guardSource).toContain('this.sessions.authenticate(');
    expect(guardSource).toContain('this.sessions.assertCsrf(');
  });

  it('exports WP_B2_RATE_LIMITER and removes @Optional() from booking controllers', () => {
    expect(Reflect.getMetadata('exports', ApiSafetyModule)).toContain(
      WP_B2_RATE_LIMITER
    );
    for (const file of [
      '../appointments/appointment.controller.ts',
      '../schedule/schedule.controller.ts',
      './return-lookup.controller.ts'
    ]) {
      const controllerSource = readApiFile(file);
      expect(controllerSource).toContain('WP_B2_RATE_LIMITER');
      expect(controllerSource).not.toContain('@Optional()');
      expect(controllerSource).not.toContain('rateLimiter?:');
    }
  });

  it('refuses ReturnLookupController startup when WP_B2_RATE_LIMITER is absent', async () => {
    await expect(
      NestFactory.create(
        ReturnLookupMissingLimiterModule,
        new FastifyAdapter({ logger: false }),
        { logger: false, abortOnError: false }
      )
    ).rejects.toThrow('WpB2RateLimiter');
  });
});
