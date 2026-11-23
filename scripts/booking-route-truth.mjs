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

export const INTERNAL_TEST_CONTROLLERS = Object.freeze([
  'AppointmentController',
  'ScheduleController',
  'ReturnLookupController'
]);

export const DEFERRED_CONTROLLERS = Object.freeze([
  'BookPilotController',
  'CalendarWatchController'
]);

const APPOINTMENT_CONTROLLER = INTERNAL_TEST_CONTROLLERS[0];
const SCHEDULE_CONTROLLER = INTERNAL_TEST_CONTROLLERS[1];
const RETURN_LOOKUP_CONTROLLER = INTERNAL_TEST_CONTROLLERS[2];
const BOOK_PILOT_CONTROLLER = DEFERRED_CONTROLLERS[0];
const CALENDAR_WATCH_CONTROLLER = DEFERRED_CONTROLLERS[1];

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
  const direct = new Set(app.controllers);
  const appointmentDirect = direct.has(APPOINTMENT_CONTROLLER);
  const scheduleDirect = direct.has(SCHEDULE_CONTROLLER);
  const returnLookupDirect = direct.has(RETURN_LOOKUP_CONTROLLER);
  const bookPilotDirect =
    direct.has(BOOK_PILOT_CONTROLLER) ||
    app.importedModules.includes('BookPilotModule');
  const watchDirect = direct.has(CALENDAR_WATCH_CONTROLLER);

  return {
    routedControllers: [...routedControllers].sort(),
    visitedModules: [...visitedModules].sort(),
    appointmentControllerRouted: routedControllers.has(APPOINTMENT_CONTROLLER),
    scheduleControllerRouted: routedControllers.has(SCHEDULE_CONTROLLER),
    returnLookupControllerRouted: routedControllers.has(
      RETURN_LOOKUP_CONTROLLER
    ),
    bookPilotControllerRouted: routedControllers.has(BOOK_PILOT_CONTROLLER),
    calendarWatchControllerRouted: routedControllers.has(
      CALENDAR_WATCH_CONTROLLER
    ),
    appointmentControllerDirectOnAppModule: appointmentDirect,
    scheduleControllerDirectOnAppModule: scheduleDirect,
    returnLookupControllerDirectOnAppModule: returnLookupDirect,
    bookPilotDirectOnAppModule: bookPilotDirect,
    calendarWatchDirectOnAppModule: watchDirect,
    internalTestAppointmentRouted:
      routedControllers.has(APPOINTMENT_CONTROLLER) && !appointmentDirect,
    internalTestScheduleRouted:
      routedControllers.has(SCHEDULE_CONTROLLER) && !scheduleDirect,
    internalTestReturnLookupRouted:
      routedControllers.has(RETURN_LOOKUP_CONTROLLER) && !returnLookupDirect
  };
}

export function classifyLiveBookingRouting(repoRoot) {
  return classifyBookingRouting(loadApiModuleSources(repoRoot));
}

/**
 * Deferred formal booking and Calendar watch must stay off the production
 * compose. Direct AppModule mounts of internal-test controllers are also
 * forbidden: the only authorised path is InternalTestBookingModule.
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
    blockers.push(`${CALENDAR_WATCH_CONTROLLER} must stay UNROUTED.`);
  }
  if (truth.appointmentControllerDirectOnAppModule) {
    blockers.push(
      `${APPOINTMENT_CONTROLLER} must not be mounted directly on AppModule.`
    );
  }
  if (truth.scheduleControllerDirectOnAppModule) {
    blockers.push(
      `${SCHEDULE_CONTROLLER} must not be mounted directly on AppModule.`
    );
  }
  if (truth.returnLookupControllerDirectOnAppModule) {
    blockers.push(
      `${RETURN_LOOKUP_CONTROLLER} must not be mounted directly on AppModule.`
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
