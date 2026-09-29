import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import type { CalendarPilotAuthenticatedRequest } from '../calendar/calendar-pilot.controller.js';
import type { BusinessDeliveryApplicationService } from './business-delivery.application-service.js';
import { REAUTHENTICATION_HEADER } from './reauthentication.js';
import { BUSINESS_DELIVERY_APPLICATION } from './business-delivery.tokens.js';

/**
 * CP-03 routes. Every route needs the server-established Google + TOTP staff
 * session (and CSRF for POST) before the application service applies the
 * feature switch, RBAC and, for confirmations, fresh re-authentication.
 */
@Controller('business-delivery')
@UseGuards(CalendarPilotSessionGuard)
export class BusinessDeliveryController {
  public constructor(
    @Inject(BUSINESS_DELIVERY_APPLICATION)
    private readonly application: BusinessDeliveryApplicationService
  ) {}

  @Get('monthly-usage')
  public monthlyUsage(
    @Query() query: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.monthlyUsage(
      query,
      request.calendarPilotAuthentication
    );
  }

  @Get('milestones')
  public milestones(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.milestones(request.calendarPilotAuthentication);
  }

  @Post('milestones/:milestoneId/acknowledgements')
  public acknowledge(
    @Param('milestoneId') milestoneId: string,
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.acknowledge(
      milestoneId,
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }
}
