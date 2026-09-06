import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common';
import {
  CreateAppointmentRequestSchema,
  RescheduleAppointmentRequestSchema
} from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import { ServiceUnavailableError } from '../platform/errors/api-error.js';
import { AppointmentApplicationService } from './appointment.application-service.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';

export const APPOINTMENT_AUTHENTICATOR = 'AppointmentAuthenticator';
export const APPOINTMENT_AUTHORIZATION = 'AppointmentAuthorizationPolicy';
export const APPOINTMENT_APPLICATION = 'AppointmentApplicationService';

export interface AuthenticatableRequest {
  readonly headers: Record<string, unknown>;
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
 * Unrouted appointment write surface. Production `AppModule` must not import
 * this controller: `/v1/bookings` stays 404 until Stage 2 C2～C6 and D-004 /
 * D-005 close. Test-only Nest modules may register it to prove RBAC mapping.
 */
@Controller('bookings')
export class AppointmentController {
  public constructor(
    @Inject(APPOINTMENT_APPLICATION)
    private readonly appointments: AppointmentApplicationService,
    @Inject(APPOINTMENT_AUTHORIZATION)
    private readonly authorization: AppointmentAuthorizationPolicy,
    @Inject(APPOINTMENT_AUTHENTICATOR)
    private readonly authenticator: AppointmentAuthenticator
  ) {}

  @Post()
  public async create(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
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
    const authentication = await this.authenticator.authenticate(request);
    identifier(appointmentId);
    await this.authorization.assertCanDelete(authentication);
    // Persistence stays unwired. An allowed caller still cannot delete through
    // this unrouted controller; the 503 is the evidence that authorization
    // ran and the write path did not invent a deletion.
    throw new ServiceUnavailableError();
  }
}
