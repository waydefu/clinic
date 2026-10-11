import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { ApiSafetyModule } from './firestore/api-safety.module.js';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter.js';
import { HealthController } from './health.controller.js';
import { BusinessDeliveryModule } from './business-delivery/business-delivery.module.js';
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
    ApiSafetyModule,
    CalendarPilotModule,
    BusinessDeliveryModule,
    InternalTestBookingModule.register()
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
export class AppModule {}
