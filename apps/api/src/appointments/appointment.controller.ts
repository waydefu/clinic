import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req
} from '@nestjs/common';
import {
  CancelAppointmentRequestSchema,
  CreateAppointmentRequestSchema,
  RecordFollowUpRequestSchema,
  DeleteAppointmentRequestSchema,
  RescheduleAppointmentRequestSchema,
  type GetAppointmentResponse
} from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import { AppointmentApplicationService } from './appointment.application-service.js';
import {
  assertInternalTestBookingWritable,
  type InternalTestBookingSettings
} from '../internal-test-booking/internal-test-booking.gate.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS,
  type InternalTestBookingClock
} from '../internal-test-booking/internal-test-booking.tokens.js';

export const APPOINTMENT_AUTHENTICATOR = 'AppointmentAuthenticator';
export const APPOINTMENT_AUTHORIZATION = 'AppointmentAuthorizationPolicy';
export const APPOINTMENT_APPLICATION = 'AppointmentApplicationService';

export interface AuthenticatableRequest {
  readonly headers: Record<string, unknown>;
  readonly method?: string;
}

export interface AppointmentAuthenticator {
  authenticate(request: AuthenticatableRequest): Promise<AuthenticationContext>;
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function identifier(value: string): string {
  if (!OPAQUE_ID.test(value)) throw new Error('Invalid opaque identifier.');
  return value;
}

/**
 * Appointment write surface. Production public traffic stays refused:
 * `InternalTestBookingModule` supplies fail-closed IP-001 settings so
 * `/v1/bookings` is 503 unless the isolated-test gate is explicitly open.
 * Settings are required: missing configuration is a boot failure, and a
 * closed gate is HTTP 503. Test harnesses inject an explicit open fixture.
 */
@Controller('bookings')
export class AppointmentController {
  public constructor(
    @Inject(APPOINTMENT_APPLICATION)
    private readonly appointments: AppointmentApplicationService,
    @Inject(APPOINTMENT_AUTHENTICATOR)
    private readonly authenticator: AppointmentAuthenticator,
    @Inject(INTERNAL_TEST_BOOKING_SETTINGS)
    private readonly internalTestSettings: InternalTestBookingSettings,
    @Inject(INTERNAL_TEST_BOOKING_CLOCK)
    private readonly internalTestClock: InternalTestBookingClock
  ) {}

  private assertInternalTestGate(): void {
    assertInternalTestBookingWritable(
      this.internalTestClock.nowUtc(),
      this.internalTestSettings
    );
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.create(
      CreateAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Get(':appointmentId')
  public async get(
    @Param('appointmentId') appointmentId: string,
    @Req() request: AuthenticatableRequest
  ): Promise<GetAppointmentResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.get(identifier(appointmentId), authentication);
  }

  @Post(':appointmentId/cancel')
  public async cancel(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.cancel(
      identifier(appointmentId),
      CancelAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/reschedule')
  public async reschedule(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.reschedule(
      identifier(appointmentId),
      RescheduleAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/arrive')
  public async arrive(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.arrive(
      identifier(appointmentId),
      CancelAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/complete')
  public async complete(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.complete(
      identifier(appointmentId),
      CancelAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/no-show')
  public async markNoShow(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.markNoShow(
      identifier(appointmentId),
      CancelAppointmentRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/follow-up')
  public async recordFollowUp(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.recordFollowUp(
      identifier(appointmentId),
      RecordFollowUpRequestSchema.parse(body),
      authentication
    );
  }

  @Post(':appointmentId/delete')
  public async delete(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.appointments.delete(
      identifier(appointmentId),
      DeleteAppointmentRequestSchema.parse(body),
      authentication
    );
  }
}
