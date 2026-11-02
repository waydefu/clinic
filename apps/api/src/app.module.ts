import { Module, type DynamicModule } from '@nestjs/common';
import type { SharedMaintenanceControl } from '@beauessence/domain/maintenance-control.node';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { ApiSafetyModule } from './firestore/api-safety.module.js';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter.js';
import { HealthController } from './health.controller.js';
import { BusinessDeliveryModule } from './business-delivery/business-delivery.module.js';
import { CalendarPilotModule } from './calendar/calendar-pilot.module.js';
import { InternalTestBookingModule } from './internal-test-booking/internal-test-booking.module.js';
import { NoStoreInterceptor } from './platform/runtime/no-store.interceptor.js';
import { ObservabilityModule } from './platform/runtime/observability.module.js';
import {
  MAINTENANCE_GATE,
  ControlledMaintenanceGate
} from './platform/runtime/maintenance-gate.js';
import { MaintenanceGuard } from './platform/runtime/maintenance.guard.js';

/**
 * CAL-PILOT is a separately approved, expiring synthetic-only surface.
 * IP-001 mounts `InternalTestBookingModule` with fail-closed production
 * default. Public production `/v1/bookings` stays unauthorised.
 */
@Module({
  imports: [
    ObservabilityModule,
    ApiSafetyModule,
    CalendarPilotModule,
    BusinessDeliveryModule,
    InternalTestBookingModule.register()
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: MAINTENANCE_GATE,
      useFactory: () => new ControlledMaintenanceGate()
    },
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
export class AppModule {
  public static withMaintenanceControl(
    control: SharedMaintenanceControl
  ): DynamicModule {
    return {
      module: AppModule,
      providers: [
        {
          provide: MAINTENANCE_GATE,
          useValue: new ControlledMaintenanceGate(control)
        }
      ]
    };
  }
}
