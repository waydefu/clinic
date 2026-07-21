import { Module } from '@nestjs/common';

import { TestOnlyBookingController } from './test-only-booking.controller.js';
import { TestOnlyBookingService } from './test-only-booking.service.js';

@Module({
  controllers: [TestOnlyBookingController],
  providers: [TestOnlyBookingService]
})
export class TestOnlyBookingModule {}
