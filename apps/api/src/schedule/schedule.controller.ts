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
    @Optional()
    @Inject(INTERNAL_TEST_BOOKING_SETTINGS)
    private readonly internalTestSettings?: InternalTestBookingSettings,
    @Optional()
    @Inject(INTERNAL_TEST_BOOKING_CLOCK)
    private readonly internalTestClock?: InternalTestBookingClock
  ) {}

  private assertInternalTestGate(): void {
    if (this.internalTestSettings === undefined) return;
    assertInternalTestBookingWritable(
      this.internalTestClock?.nowUtc() ?? new Date().toISOString(),
      this.internalTestSettings
    );
  }

  @Get('slots')
  public async listSlots(
    @Query('kind') kind: string | undefined,
    @Req() request: AuthenticatableRequest
  ): Promise<ListSlotsResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
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
    const authentication = await this.authenticator.authenticate(request);
    return this.schedules.read(authentication);
  }

  @Post('schedule/publish')
  public async publish(
    @Body() body: unknown,
    @Req() request: AuthenticatableRequest
  ): Promise<PublishScheduleResponse> {
    this.assertInternalTestGate();
    const authentication = await this.authenticator.authenticate(request);
    return this.schedules.publish(
      PublishScheduleRequestSchema.parse(body),
      authentication
    );
  }
}
