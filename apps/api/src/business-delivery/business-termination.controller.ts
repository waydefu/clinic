import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import type { CalendarPilotAuthenticatedRequest } from '../calendar/calendar-pilot.controller.js';
import { BUSINESS_TERMINATION_APPLICATION } from './business-delivery.tokens.js';
import type { BusinessTerminationApplicationService } from './business-termination.application-service.js';
import { REAUTHENTICATION_HEADER } from './reauthentication.js';

/** CP-07 endpoints; every write is session guarded, CSRF checked and reauthenticated. */
@Controller('business-delivery/terminations')
@UseGuards(CalendarPilotSessionGuard)
export class BusinessTerminationController {
  public constructor(
    @Inject(BUSINESS_TERMINATION_APPLICATION)
    private readonly application: BusinessTerminationApplicationService
  ) {}

  @Post()
  public create(
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.create(
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }

  @Get(':terminationId')
  public get(
    @Param('terminationId') terminationId: string,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.get(
      terminationId,
      request.calendarPilotAuthentication
    );
  }

  @Post(':terminationId/acknowledgements')
  public acknowledge(
    @Param('terminationId') terminationId: string,
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.acknowledge(
      terminationId,
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }

  @Post(':terminationId/close')
  public close(
    @Param('terminationId') terminationId: string,
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.close(
      terminationId,
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }
}
