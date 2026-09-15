import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  APP_MODULE_PATH,
  loadApiModuleSources
} from './nest-module-reachability.mjs';
import {
  bookingAndWatchRemainUnrouted,
  classifyBookingRouting,
  classifyLiveBookingRouting,
  deferredBookingRoutingBlockers
} from './booking-route-truth.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('booking route truth', () => {
  it('classifies live InternalTestBookingModule as routed and deferred surfaces as unrouted', () => {
    const truth = classifyLiveBookingRouting(root);
    expect(truth.internalTestAppointmentRouted).toBe(true);
    expect(truth.internalTestScheduleRouted).toBe(true);
    expect(truth.internalTestReturnLookupRouted).toBe(true);
    expect(truth.appointmentControllerDirectOnAppModule).toBe(false);
    expect(truth.bookPilotControllerRouted).toBe(false);
    expect(truth.calendarWatchControllerRouted).toBe(false);
    expect(deferredBookingRoutingBlockers(truth)).toEqual([]);
    expect(bookingAndWatchRemainUnrouted(loadApiModuleSources(root))).toBe(
      true
    );
  });

  it('detects an indirectly mounted controller even when AppModule does not name it', () => {
    const sources = new Map([
      [
        APP_MODULE_PATH,
        `
          import { InternalTestBookingModule } from './internal-test-booking.module.js';
          @Module({ imports: [InternalTestBookingModule.register()] })
          export class AppModule {}
        `
      ],
      [
        'apps/api/src/internal-test-booking.module.ts',
        `
          import { AppointmentController } from './appointment.controller.js';
          @Module({})
          export class InternalTestBookingModule {
            static register() {
              return {
                module: InternalTestBookingModule,
                controllers: [AppointmentController]
              };
            }
          }
        `
      ]
    ]);
    const liveAppModule = readFileSync(
      join(root, 'apps/api/src/app.module.ts'),
      'utf8'
    );
    expect(liveAppModule).not.toMatch(/\bAppointmentController\b/);

    const truth = classifyBookingRouting(sources);
    expect(sources.get(APP_MODULE_PATH)).not.toMatch(
      /\bAppointmentController\b/
    );
    expect(truth.appointmentControllerRouted).toBe(true);
    expect(truth.internalTestAppointmentRouted).toBe(true);
    expect(truth.appointmentControllerDirectOnAppModule).toBe(false);
    expect(bookingAndWatchRemainUnrouted(truth)).toBe(true);
  });

  it('keeps deferred BookPilot and CalendarWatch unrouted unless a reachable module mounts them', () => {
    const unrouted = classifyBookingRouting(
      new Map([
        [
          APP_MODULE_PATH,
          `
            import { FeatureModule } from './feature.module.js';
            @Module({ imports: [FeatureModule] })
            export class AppModule {}
          `
        ],
        [
          'apps/api/src/feature.module.ts',
          '@Module({ controllers: [] }) export class FeatureModule {}'
        ],
        [
          'apps/api/src/book-pilot.module.ts',
          `
            import { BookPilotController } from './book-pilot.controller.js';
            @Module({ controllers: [BookPilotController] })
            export class BookPilotModule {}
          `
        ]
      ])
    );
    expect(unrouted.bookPilotControllerRouted).toBe(false);
    expect(unrouted.calendarWatchControllerRouted).toBe(false);

    const routedWatch = classifyBookingRouting(
      new Map([
        [
          APP_MODULE_PATH,
          `
            import { CalendarWatchController } from './calendar-watch.controller.js';
            @Module({ controllers: [CalendarWatchController] })
            export class AppModule {}
          `
        ]
      ])
    );
    expect(routedWatch.calendarWatchControllerRouted).toBe(true);
    expect(bookingAndWatchRemainUnrouted(routedWatch)).toBe(false);
  });

  it('treats a direct AppModule AppointmentController mount as a routing blocker', () => {
    expect(
      bookingAndWatchRemainUnrouted('controllers: [AppointmentController]')
    ).toBe(false);
    expect(
      bookingAndWatchRemainUnrouted(
        'controllers: [AppointmentController, CalendarWatchController]'
      )
    ).toBe(false);
    expect(
      bookingAndWatchRemainUnrouted('controllers: [BookPilotController]')
    ).toBe(false);
  });
});
