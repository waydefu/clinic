import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import {
  ActivateCalendarSourceRequestSchema,
  CalendarCommandBaseSchema,
  CancelSyntheticAppointmentRequestSchema,
  CompleteCalendarSourceSwitchRequestSchema,
  CorrectCalendarCandidateRequestSchema,
  CreateSyntheticAppointmentRequestSchema,
  RescheduleSyntheticAppointmentRequestSchema,
  ResolveCalendarCandidateRequestSchema,
  ReviewCalendarCandidateRequestSchema
} from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import type { CalendarPilotApplicationService } from './calendar-pilot.application-service.js';
import { CALENDAR_PILOT_APPLICATION } from './calendar-pilot.tokens.js';

export interface CalendarPilotAuthenticatedRequest {
  /** Set only by the server-side Google+TOTP session guard. */
  readonly calendarPilotAuthentication: AuthenticationContext;
}

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function identifier(value: string): string {
  if (!OPAQUE_ID.test(value)) throw new Error('Invalid opaque identifier.');
  return value;
}

/**
 * Synthetic-only route surface. Registration stays inside CalendarPilotModule;
 * every route is protected by the server-established Google+TOTP session guard.
 */
@Controller('calendar')
@UseGuards(CalendarPilotSessionGuard)
export class CalendarPilotController {
  public constructor(
    @Inject(CALENDAR_PILOT_APPLICATION)
    private readonly application: CalendarPilotApplicationService
  ) {}

  @Get('status')
  public status(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.status(request.calendarPilotAuthentication);
  }

  @Get('sources')
  public sources(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.sources(request.calendarPilotAuthentication);
  }

  @Post('sources/:sourceId/preflight')
  public preflight(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    const command = CalendarCommandBaseSchema.parse(body);
    return this.application.preflightSource(
      ActivateCalendarSourceRequestSchema.parse({
        ...command,
        sourceId: identifier(sourceId)
      }),
      request.calendarPilotAuthentication
    );
  }

  @Post('sources/:sourceId/activate')
  public activate(
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    const command = CompleteCalendarSourceSwitchRequestSchema.parse(body);
    return this.application.activateSource(
      { ...command, sourceId: identifier(sourceId) },
      request.calendarPilotAuthentication
    );
  }

  @Get('sources/preflights/:preflightId')
  public sourcePreflight(
    @Param('preflightId') preflightId: string,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.sourcePreflight(
      identifier(preflightId),
      request.calendarPilotAuthentication
    );
  }

  @Post('sources/rollback')
  public rollback(
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.rollbackSource(
      CompleteCalendarSourceSwitchRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Get('candidates')
  public candidates(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.candidates(request.calendarPilotAuthentication);
  }

  @Post('candidates/:candidateId/accept')
  public accept(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.reviewCandidate(
      identifier(candidateId),
      'accept',
      ReviewCalendarCandidateRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Post('candidates/:candidateId/reject')
  public reject(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.reviewCandidate(
      identifier(candidateId),
      'reject',
      ReviewCalendarCandidateRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Post('candidates/:candidateId/resolve')
  public resolve(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.resolveCandidate(
      identifier(candidateId),
      ResolveCalendarCandidateRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Post('candidates/:candidateId/correct')
  public correct(
    @Param('candidateId') candidateId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.correctCandidate(
      identifier(candidateId),
      CorrectCalendarCandidateRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Get('availability')
  public availability(
    @Query('from') _from: string | undefined,
    @Query('to') _to: string | undefined,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.availability(request.calendarPilotAuthentication);
  }

  @Post('synthetic-appointments')
  public createAppointment(
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.createSyntheticAppointment(
      CreateSyntheticAppointmentRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Get('synthetic-appointments')
  public appointments(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.appointments(request.calendarPilotAuthentication);
  }

  @Get('synthetic-patients')
  public patients(@Req() request: CalendarPilotAuthenticatedRequest) {
    return this.application.patients(request.calendarPilotAuthentication);
  }

  @Post('synthetic-appointments/:appointmentId/reschedule')
  public rescheduleAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.rescheduleSyntheticAppointment(
      identifier(appointmentId),
      RescheduleSyntheticAppointmentRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }

  @Post('synthetic-appointments/:appointmentId/cancel')
  public cancelAppointment(
    @Param('appointmentId') appointmentId: string,
    @Body() body: unknown,
    @Req() request: CalendarPilotAuthenticatedRequest
  ) {
    return this.application.cancelSyntheticAppointment(
      identifier(appointmentId),
      CancelSyntheticAppointmentRequestSchema.parse(body),
      request.calendarPilotAuthentication
    );
  }
}
