import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';

/**
 * The API currently exposes only /v1/health. The booking write path exists as
 * a repository plus Emulator tests (see apps/api/src/firestore) but is
 * deliberately not routed: the Phase 1 gate forbids enabling a booking write
 * endpoint before the privacy, appointment-policy and role decisions land.
 */
@Module({
  controllers: [HealthController]
})
export class AppModule {}
