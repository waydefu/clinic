import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import type { CalendarPilotAuthenticatedRequest } from '../calendar/calendar-pilot.controller.js';
import type { BusinessRetentionApplicationService } from './business-retention.application-service.js';
import { BUSINESS_RETENTION_APPLICATION } from './business-delivery.tokens.js';
import { PENDING_DELETION_NEXT_CURSOR_HEADER } from './pending-deletion-cursor.js';
import { REAUTHENTICATION_HEADER } from './reauthentication.js';

interface HeaderReply {
  header(name: string, value: string): void;
}

/** CP-05 retention routes; all writes also pass the session guard's CSRF check. */
@Controller('business-delivery/retention')
@UseGuards(CalendarPilotSessionGuard)
export class BusinessRetentionController {
  public constructor(
    @Inject(BUSINESS_RETENTION_APPLICATION)
    private readonly application: BusinessRetentionApplicationService
  ) {}

  @Post('archive')
  public archive(
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.archive(
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }

  @Post('restore')
  public restore(
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.restore(body, request.calendarPilotAuthentication);
  }

  @Get('identity-candidates')
  public identityCandidates(
    @Query('patientId') patientId: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.identityCandidates(
      patientId,
      request.calendarPilotAuthentication
    );
  }

  @Post('confirm-identity')
  public confirmArchivedIdentity(
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.confirmArchivedIdentity(
      body,
      request.calendarPilotAuthentication
    );
  }

  @Post('permanent-delete')
  public permanentlyDelete(
    @Body() body: unknown,
    @Headers(REAUTHENTICATION_HEADER) reauthenticationToken: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.permanentlyDelete(
      body,
      reauthenticationToken,
      request.calendarPilotAuthentication
    );
  }

  @Post('legal-hold')
  public setLegalHold(
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.setLegalHold(
      body,
      request.calendarPilotAuthentication
    );
  }

  @Get('pending-deletion')
  public async pendingDeletion(
    @Query() query: Record<string, unknown>,
    @Req() request: CalendarPilotAuthenticatedRequest,
    @Res({ passthrough: true }) reply: HeaderReply
  ) {
    const page = await this.application.pendingDeletionPage(
      request.calendarPilotAuthentication,
      query
    );
    if (page.nextCursor !== undefined)
      reply.header(PENDING_DELETION_NEXT_CURSOR_HEADER, page.nextCursor);
    return page.response;
  }
}
