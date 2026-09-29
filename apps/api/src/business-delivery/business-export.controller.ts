import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import type { CalendarPilotAuthenticatedRequest } from '../calendar/calendar-pilot.controller.js';
import type { BusinessExportApplicationService } from './business-export.application-service.js';
import { BUSINESS_EXPORT_APPLICATION } from './business-delivery.tokens.js';
import { REAUTHENTICATION_HEADER } from './reauthentication.js';

interface HeaderReply {
  header(name: string, value: string): void;
}

/**
 * CP-04 export routes. The staff session guard (and CSRF for POST) runs first;
 * the application service then applies the feature switch, RBAC and, for a
 * new file, fresh re-authentication.
 */
@Controller('business-delivery/exports')
@UseGuards(CalendarPilotSessionGuard)
export class BusinessExportController {
  public constructor(
    @Inject(BUSINESS_EXPORT_APPLICATION)
    private readonly application: BusinessExportApplicationService
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

  @Get(':exportId')
  public get(
    @Param('exportId') exportId: string,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.get(exportId, request.calendarPilotAuthentication);
  }

  @Get(':exportId/download')
  public async download(
    @Param('exportId') exportId: string,
    @Req() request: CalendarPilotAuthenticatedRequest,
    @Res({ passthrough: true }) reply: HeaderReply
  ): Promise<string> {
    const result = await this.application.download(
      exportId,
      request.calendarPilotAuthentication
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="export-${result.job.from}-${result.job.to}.csv"`
    );
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return result.content;
  }

  @Post(':exportId/revoke')
  public revoke(
    @Param('exportId') exportId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.revoke(
      exportId,
      body,
      request.calendarPilotAuthentication
    );
  }
}
