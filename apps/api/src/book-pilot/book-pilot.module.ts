import { Module } from '@nestjs/common';

import { BookPilotController } from './book-pilot.controller.js';
import type { BookPilotSettings } from './book-pilot.gate.js';
import { BOOK_PILOT_CLOCK, BOOK_PILOT_SETTINGS } from './book-pilot.tokens.js';

function settingsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): BookPilotSettings {
  return {
    enabled: env.BOOK_PILOT_ENABLED === 'true',
    expiresAtUtc: env.BOOK_PILOT_EXPIRES_AT_UTC
  };
}

/**
 * Isolated BOOK-PILOT Nest module. Do not import from production `AppModule`.
 * Authenticator, authorization and application tokens are supplied only by a
 * test harness or a later exact-SHA composing module. Default env is
 * fail-closed (kill switch off, expiry absent).
 */
@Module({
  controllers: [BookPilotController],
  providers: [
    { provide: BOOK_PILOT_SETTINGS, useFactory: () => settingsFromEnv() },
    {
      provide: BOOK_PILOT_CLOCK,
      useValue: { nowUtc: () => new Date().toISOString() }
    }
  ]
})
export class BookPilotModule {}
