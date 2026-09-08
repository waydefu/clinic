import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import {
  CreateAppointmentRequestSchema,
  RescheduleAppointmentRequestSchema
} from '@beauessence/contracts';

import type { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import type {
  AppointmentAuthenticator,
  AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import type { AppointmentAuthorizationPolicy } from '../appointments/appointment.policy.js';
import { ServiceUnavailableError } from '../platform/errors/api-error.js';
import {
  assertBookPilotWritable,
  type BookPilotSettings
} from './book-pilot.gate.js';
import {
  BOOK_PILOT_APPLICATION,
  BOOK_PILOT_AUTHENTICATOR,
  BOOK_PILOT_AUTHORIZATION,
  BOOK_PILOT_CLOCK,
  BOOK_PILOT_SETTINGS
} from './book-pilot.tokens.js';

export interface BookPilotClock {
  nowUtc(): string;
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function identifier(value: string): string {
  if (!OPAQUE_ID.test(value)) throw new Error('Invalid opaque identifier.');
  return value;
}

/**
 * Isolated BOOK-PILOT write surface. Prefix is `/v1/book-pilot/bookings`, not
 * production `/v1/bookings`. Production `AppModule` must not import the
 * module: this controller stays unrouted until a later exact-SHA authority.
 * Fail-closed kill switch / UTC expiry uses `SERVICE_UNAVAILABLE` (503), not
 * a new `GONE` contract code.
 */
@Controller('book-pilot/bookings')
export class BookPilotController {
  public constructor(
    @Inject(BOOK_PILOT_APPLICATION)
    private readonly appointments: AppointmentApplicationService,
    @Inject(BOOK_PILOT_AUTHORIZATION)
    private readonly authorization: AppointmentAuthorizationPolicy,
    @Inject(BOOK_PILOT_AUTHENTICATOR)
    private readonly authenticator: AppointmentAuthenticator,
    @Inject(BOOK_PILOT_SETTINGS)
    private readonly settings: BookPilotSettings,
    @Inject(BOOK_PILOT_CLOCK)
    private readonly clock: BookPilotClock
  ) {}

  private assertWritable(): void {
    assertBookPilotWritable(this.clock.nowUtc(), this.settings);
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertWritable();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.create(
      CreateAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/reschedule')
  public async reschedule(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertWritable();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.reschedule(
      identifier(appointmentId),
      RescheduleAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/delete')
  public async delete(
    @Param('appointmentId') appointmentId: string,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertWritable();
    const authentication = await this.authenticator.authenticate(request);
    identifier(appointmentId);
    await this.authorization.assertCanDelete(authentication);
    throw new ServiceUnavailableError();
  }
}
