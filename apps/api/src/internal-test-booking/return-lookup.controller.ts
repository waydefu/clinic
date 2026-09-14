import { Body, Controller, Inject, Optional, Post, Req } from '@nestjs/common';
import { ReturnLookupRequestSchema } from '@beauessence/contracts';

import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import {
  assertInternalTestBookingWritable,
  type InternalTestBookingSettings
} from './internal-test-booking.gate.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS,
  type InternalTestBookingClock
} from './internal-test-booking.tokens.js';
import { deriveClientIp } from '../platform/runtime/client-ip.js';
import {
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';

@Controller('return-lookup')
export class ReturnLookupController {
  public constructor(
    @Inject(APPOINTMENT_APPLICATION)
    private readonly appointments: AppointmentApplicationService,
    @Inject(APPOINTMENT_AUTHENTICATOR)
    private readonly authenticator: AppointmentAuthenticator,
    @Inject(INTERNAL_TEST_BOOKING_SETTINGS)
    private readonly internalTestSettings: InternalTestBookingSettings,
    @Inject(INTERNAL_TEST_BOOKING_CLOCK)
    private readonly internalTestClock: InternalTestBookingClock,
    @Optional()
    @Inject(WP_B2_RATE_LIMITER)
    private readonly rateLimiter?: WpB2RateLimiter
  ) {}

  @Post()
  public async lookup(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ) {
    assertInternalTestBookingWritable(
      this.internalTestClock.nowUtc(),
      this.internalTestSettings
    );
    const ip = deriveClientIp(request);
    const authentication = await this.authenticator
      .authenticate(request)
      .catch(() => undefined);
    if (this.rateLimiter !== undefined) {
      const actorId = authentication?.actorId;
      await this.rateLimiter.assertRequest(
        actorId === undefined
          ? { ip, write: false }
          : { ip, actorId, write: false }
      );
    }
    return this.appointments.lookupReturn(
      ReturnLookupRequestSchema.parse(body),
      ip,
      this.rateLimiter
    );
  }
}
