import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post
} from '@nestjs/common';
import { DomainError } from '@beauessence/domain';
import type { TestOnlySchedule } from '@beauessence/domain';

import {
  TestOnlyBookingService,
  type TestOnlyBookingSnapshot
} from './test-only-booking.service.js';

@Controller('test-only')
export class TestOnlyBookingController {
  public constructor(
    private readonly testOnlyBooking: TestOnlyBookingService
  ) {}

  @Get('state')
  public getState(): TestOnlyBookingSnapshot {
    return this.testOnlyBooking.getSnapshot();
  }

  @Post('bookings')
  @HttpCode(200)
  public reserve(
    @Body() body: { readonly slotId?: unknown }
  ): TestOnlyBookingSnapshot {
    if (typeof body.slotId !== 'string') {
      throw new BadRequestException(
        'slotId must be a synthetic opaque identifier.'
      );
    }

    try {
      return this.testOnlyBooking.reserve(body.slotId);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  @Post('bookings/:appointmentId/cancellation')
  @HttpCode(200)
  public cancel(
    @Param('appointmentId') appointmentId: string
  ): TestOnlyBookingSnapshot {
    try {
      return this.testOnlyBooking.cancel(appointmentId);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  @Post('bookings/:appointmentId/complete')
  @HttpCode(200)
  public complete(
    @Param('appointmentId') appointmentId: string
  ): TestOnlyBookingSnapshot {
    try {
      return this.testOnlyBooking.complete(appointmentId);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  @Post('reset')
  @HttpCode(200)
  public reset(): TestOnlyBookingSnapshot {
    return this.testOnlyBooking.reset();
  }

  @Post('follow-up/decision')
  @HttpCode(200)
  public setFollowUpDecision(
    @Body() body: { readonly status?: unknown; readonly dueDate?: unknown }
  ): TestOnlyBookingSnapshot {
    if (body.status !== 'required' && body.status !== 'not_required') {
      throw new BadRequestException('status must be required or not_required.');
    }
    if (body.dueDate !== undefined && typeof body.dueDate !== 'string') {
      throw new BadRequestException(
        'dueDate must be a local date string when present.'
      );
    }
    try {
      return this.testOnlyBooking.setFollowUpDecision(
        body.status,
        body.dueDate
      );
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  @Post('schedule')
  @HttpCode(200)
  public setSchedule(@Body() body: unknown): TestOnlyBookingSnapshot {
    try {
      return this.testOnlyBooking.setSchedule(body as TestOnlySchedule);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  private rethrowDomainError(error: unknown): never {
    if (error instanceof DomainError && error.code === 'SLOT_UNAVAILABLE') {
      throw new ConflictException(error.message);
    }
    if (error instanceof DomainError || error instanceof Error) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
