import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
  Post,
  Query,
  Req
} from '@nestjs/common';
import {
  PublishScheduleRequestSchema,
  type GetPublishedScheduleResponse,
  type ListSlotsResponse,
  type PublishScheduleResponse
} from '@beauessence/contracts';

import type { AuthenticatableRequest } from '../appointments/appointment.controller.js';
import { APPOINTMENT_AUTHENTICATOR } from '../appointments/appointment.controller.js';
import type { AppointmentAuthenticator } from '../appointments/appointment.controller.js';
import {
  assertInternalTestBookingWritable,
  type InternalTestBookingSettings
} from '../internal-test-booking/internal-test-booking.gate.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS,
  type InternalTestBookingClock
} from '../internal-test-booking/internal-test-booking.tokens.js';
import { deriveClientIp } from '../platform/runtime/client-ip.js';
import {
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';
import {
  assertInternalTestSlotKind,
  ScheduleApplicationService
} from './schedule.application-service.js';

export const SCHEDULE_APPLICATION = 'ScheduleApplicationService';

@Controller()
export class ScheduleController {
  public constructor(
    @Inject(SCHEDULE_APPLICATION)
    private readonly schedules: ScheduleApplicationService,
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

  private assertInternalTestGate(): void {
    assertInternalTestBookingWritable(
      this.internalTestClock.nowUtc(),
      this.internalTestSettings
    );
  }

  private async authenticateAndLimit(
    request: AuthenticatableRequest,
    write: boolean
  ) {
    const authentication = await this.authenticator.authenticate(request);
    request.authentication = authentication;
    if (this.rateLimiter !== undefined) {
      await this.rateLimiter.assertRequest({
        ip: deriveClientIp(request),
        actorId: authentication.actorId,
        write
      });
    }
    return authentication;
  }

  @Get('slots')
  public async listSlots(
    @Query('kind') kind: string | undefined,
    @Req() request: AuthenticatableRequest
  ): Promise<ListSlotsResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticateAndLimit(request, false);
    return this.schedules.listSlots(
      authentication,
      assertInternalTestSlotKind(kind)
    );
  }

  @Get('schedule')
  public async read(
    @Req() request: AuthenticatableRequest
  ): Promise<GetPublishedScheduleResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticateAndLimit(request, false);
    return this.schedules.read(authentication);
  }

  @Post('schedule/publish')
  public async publish(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ): Promise<PublishScheduleResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticateAndLimit(request, true);
    return this.schedules.publish(
      PublishScheduleRequestSchema.parse(body),
      authentication
    );
  }
}
