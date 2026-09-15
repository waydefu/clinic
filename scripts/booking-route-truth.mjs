import {
  APP_MODULE_PATH,
  loadApiModuleSources,
  nestModuleDecoratorSurface,
  nestModuleSurface,
  routedNestControllers
} from './nest-module-reachability.mjs';

/**
 * Canonical booking / Calendar-watch routing truth.
 *
 * File-import reachability is necessary but not sufficient: a controller is
 * routed only when a reachable Nest module lists it in `controllers`.
 *
 * Canon for Stage C:
 * - `AppointmentController` / `ScheduleController` are internal-test reachable
 *   through `AppModule → InternalTestBookingModule.register()`.
 * - `BookPilotModule` / `BookPilotController` stay unrouted.
 * - `CalendarWatchController` stays production GO_LIVE_DEFERRED / unrouted.
 * - AppModule must not list those production controllers in its own decorator.
 */

export const INTERNAL_TEST_CONTROLLERS = [
  'AppointmentController',
  'ScheduleController',
  'ReturnLookupController'
];

export const DEFERRED_CONTROLLERS = [
  'BookPilotController',
  'CalendarWatchController'
];

function appModuleSurface(appModuleSource) {
  const decorator = nestModuleDecoratorSurface(appModuleSource);
  if (
    decorator.controllers.length > 0 ||
    decorator.importedModules.length > 0
  ) {
    return decorator;
  }
  return nestModuleSurface(appModuleSource);
}

export function classifyBookingRouting(sources, entryPath = APP_MODULE_PATH) {
  const { routedControllers, visitedModules } = routedNestControllers(
    entryPath,
    sources
  );
  const appSource = sources.get(entryPath) ?? '';
  const app = appModuleSurface(appSource);
  const appointmentDirect = app.controllers.includes('AppointmentController');
  const scheduleDirect = app.controllers.includes('ScheduleController');
  const bookPilotDirect =
    app.controllers.includes('BookPilotController') ||
    app.importedModules.includes('BookPilotModule');
  const watchDirect = app.controllers.includes('CalendarWatchController');

  return {
    routedControllers: [...routedControllers].sort(),
    visitedModules: [...visitedModules].sort(),
    appointmentControllerRouted: routedControllers.has('AppointmentController'),
    scheduleControllerRouted: routedControllers.has('ScheduleController'),
    returnLookupControllerRouted: routedControllers.has(
      'ReturnLookupController'
    ),
    bookPilotControllerRouted: routedControllers.has('BookPilotController'),
    calendarWatchControllerRouted: routedControllers.has(
      'CalendarWatchController'
    ),
    appointmentControllerDirectOnAppModule: appointmentDirect,
    scheduleControllerDirectOnAppModule: scheduleDirect,
    bookPilotDirectOnAppModule: bookPilotDirect,
    calendarWatchDirectOnAppModule: watchDirect,
    internalTestAppointmentRouted:
      routedControllers.has('AppointmentController') && !appointmentDirect,
    internalTestScheduleRouted:
      routedControllers.has('ScheduleController') && !scheduleDirect,
    internalTestReturnLookupRouted: routedControllers.has(
      'ReturnLookupController'
    )
  };
}

export function classifyLiveBookingRouting(repoRoot) {
  return classifyBookingRouting(loadApiModuleSources(repoRoot));
}

/**
 * Deferred formal booking and Calendar watch must stay off the production
 * compose. Direct AppModule mounts of AppointmentController are also forbidden:
 * the only authorised path is InternalTestBookingModule.
 */
export function deferredBookingRoutingBlockers(truth) {
  const blockers = [];
  if (truth.bookPilotControllerRouted || truth.bookPilotDirectOnAppModule) {
    blockers.push('BookPilotModule/BookPilotController must stay UNROUTED.');
  }
  if (
    truth.calendarWatchControllerRouted ||
    truth.calendarWatchDirectOnAppModule
  ) {
    blockers.push('CalendarWatchController must stay UNROUTED.');
  }
  if (truth.appointmentControllerDirectOnAppModule) {
    blockers.push(
      'AppointmentController must not be mounted directly on AppModule.'
    );
  }
  if (truth.scheduleControllerDirectOnAppModule) {
    blockers.push(
      'ScheduleController must not be mounted directly on AppModule.'
    );
  }
  return blockers;
}

export function deferredSurfacesRemainUnrouted(truth) {
  return deferredBookingRoutingBlockers(truth).length === 0;
}

/**
 * Compatibility helper used by C6 smoke and sequential-C.
 *
 * A raw AppModule snippet is classified as a single-file Nest graph so older
 * tests that injected `controllers: [BookPilotController]` keep working, while
 * the live tree is classified from the transitive module graph.
 */
export function bookingAndWatchRemainUnrouted(input) {
  if (typeof input === 'string') {
    return deferredSurfacesRemainUnrouted(
      classifyBookingRouting(new Map([[APP_MODULE_PATH, input]]))
    );
  }
  if (input instanceof Map) {
    return deferredSurfacesRemainUnrouted(classifyBookingRouting(input));
  }
  return deferredSurfacesRemainUnrouted(input);
}
