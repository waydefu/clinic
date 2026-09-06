import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HealthController } from './health.controller.js';
import { CalendarPilotModule } from './calendar/calendar-pilot.module.js';
import { NoStoreInterceptor } from './platform/runtime/no-store.interceptor.js';

/**
 * The formal booking write path remains unrouted. CAL-PILOT is a separately
 * approved, expiring synthetic-only surface with its own Google+TOTP boundary.
 */
@Module({
  imports: [CalendarPilotModule],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor }]
})
export class AppModule {}
