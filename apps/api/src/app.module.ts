import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { CalendarPilotModule } from './calendar/calendar-pilot.module.js';

/**
 * The formal booking write path remains unrouted. CAL-PILOT is a separately
 * approved, expiring synthetic-only surface with its own Google+TOTP boundary.
 */
@Module({
  imports: [CalendarPilotModule],
  controllers: [HealthController]
})
export class AppModule {}
