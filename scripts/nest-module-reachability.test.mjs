import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  APP_MODULE_PATH,
  loadApiModuleSources,
  namedImportBindings,
  nestModuleDecoratorSurface,
  nestModuleSurface,
  resolveTypescriptSpecifier,
  routedNestControllers
} from './nest-module-reachability.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('nest module reachability', () => {
  it('resolves ESM .js specifiers onto .ts sources', () => {
    expect(
      resolveTypescriptSpecifier(
        'apps/api/src/app.module.ts',
        './internal-test-booking/internal-test-booking.module.js'
      )
    ).toBe(
      'apps/api/src/internal-test-booking/internal-test-booking.module.ts'
    );
  });

  it('records value named imports and ignores type-only bindings', () => {
    const bindings = namedImportBindings(`
      import type { Clock } from './clock.js';
      import { AppointmentController, type Settings } from './appointment.controller.js';
      import { InternalTestBookingModule } from './internal-test-booking.module.js';
    `);
    expect(bindings.get('AppointmentController')).toBe(
      './appointment.controller.js'
    );
    expect(bindings.get('InternalTestBookingModule')).toBe(
      './internal-test-booking.module.js'
    );
    expect(bindings.has('Clock')).toBe(false);
    expect(bindings.has('Settings')).toBe(false);
  });

  it('reads DynamicModule register() controllers, not only @Module()', () => {
    const source = `
      @Module({})
      export class InternalTestBookingModule {
        public static register() {
          return {
            module: InternalTestBookingModule,
            imports: [CalendarPilotModule],
            controllers: [AppointmentController, ScheduleController]
          };
        }
      }
    `;
    expect(nestModuleDecoratorSurface(source).controllers).toEqual([]);
    expect(nestModuleSurface(source).controllers).toEqual([
      'AppointmentController',
      'ScheduleController'
    ]);
    expect(nestModuleSurface(source).importedModules).toEqual([
      'CalendarPilotModule'
    ]);
  });

  it('detects an indirectly mounted controller as routed', () => {
    const sources = new Map([
      [
        APP_MODULE_PATH,
        `
          import { FeatureModule } from './feature.module.js';
          @Module({ imports: [FeatureModule.register()], controllers: [HealthController] })
          export class AppModule {}
        `
      ],
      [
        'apps/api/src/feature.module.ts',
        `
          import { IndirectController } from './indirect.controller.js';
          @Module({})
          export class FeatureModule {
            static register() {
              return {
                module: FeatureModule,
                controllers: [IndirectController]
              };
            }
          }
        `
      ],
      [
        'apps/api/src/indirect.controller.ts',
        'export class IndirectController {}'
      ],
      [
        'apps/api/src/deferred.module.ts',
        `
          import { CalendarWatchController } from './calendar-watch.controller.js';
          @Module({ controllers: [CalendarWatchController] })
          export class DeferredModule {}
        `
      ],
      [
        'apps/api/src/calendar-watch.controller.ts',
        'export class CalendarWatchController {}'
      ]
    ]);

    const graph = routedNestControllers(APP_MODULE_PATH, sources);
    expect(graph.routedControllers.has('IndirectController')).toBe(true);
    expect(graph.routedControllers.has('HealthController')).toBe(true);
    expect(graph.routedControllers.has('CalendarWatchController')).toBe(false);
    expect(graph.visitedModules.has('apps/api/src/deferred.module.ts')).toBe(
      false
    );
  });

  it('walks the live AppModule graph onto InternalTestBookingModule', () => {
    const sources = loadApiModuleSources(root);
    const graph = routedNestControllers(APP_MODULE_PATH, sources);
    expect(graph.routedControllers.has('AppointmentController')).toBe(true);
    expect(graph.routedControllers.has('ScheduleController')).toBe(true);
    expect(graph.routedControllers.has('HealthController')).toBe(true);
    expect(graph.routedControllers.has('BookPilotController')).toBe(false);
    expect(graph.routedControllers.has('CalendarWatchController')).toBe(false);
    expect(
      graph.visitedModules.has(
        'apps/api/src/internal-test-booking/internal-test-booking.module.ts'
      )
    ).toBe(true);
    expect(
      graph.visitedModules.has('apps/api/src/book-pilot/book-pilot.module.ts')
    ).toBe(false);
  });
});
