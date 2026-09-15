import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HealthController } from './health.controller.js';
import { CalendarPilotModule } from './calendar/calendar-pilot.module.js';
import { InternalTestBookingModule } from './internal-test-booking/internal-test-booking.module.js';
import { NoStoreInterceptor } from './platform/runtime/no-store.interceptor.js';
import { ObservabilityModule } from './platform/runtime/observability.module.js';

/**
 * CAL-PILOT is a separately approved, expiring synthetic-only surface.
 * IP-001 mounts `InternalTestBookingModule` with fail-closed production
 * default. Public production `/v1/bookings` stays unauthorised.
 */
@Module({
  imports: [
    ObservabilityModule,
    CalendarPilotModule,
    InternalTestBookingModule.register()
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }]
})
export class AppModule {}
