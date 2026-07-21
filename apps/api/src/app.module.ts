import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { TestOnlyBookingModule } from './test-only-booking.module.js';

const testOnlyBookingEnabled =
  process.env['ENABLE_TEST_ONLY_BOOKING'] === 'true';

@Module({
  imports: testOnlyBookingEnabled ? [TestOnlyBookingModule] : [],
  controllers: [HealthController]
})
export class AppModule {}
