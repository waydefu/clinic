import {
  Controller,
  HttpCode,
  Inject,
  BadRequestException,
  NotFoundException,
  Post,
  Req
} from '@nestjs/common';

/**
 * Unrouted Google Calendar push receiver. Production `AppModule` must not
 * import this controller: `/v1/calendar-watch` stays 404 until D-009/D-016
 * and exact C6 authority name this path. Notifications have no event body;
 * the injected planner decides ack vs incremental sync. Do not call Calendar
 * from a Firestore transaction.
 */
export const CALENDAR_WATCH_PLANNER = 'CalendarWatchPlanner';

export interface CalendarWatchPlanResult {
  readonly httpStatus: 204 | 400 | 404;
}

export interface CalendarWatchPlanner {
  plan(headers: Record<string, unknown>): CalendarWatchPlanResult;
}

export interface CalendarWatchRequest {
  readonly headers: Record<string, unknown>;
}

@Controller('calendar-watch')
export class CalendarWatchController {
  public constructor(
    @Inject(CALENDAR_WATCH_PLANNER)
    private readonly planner: CalendarWatchPlanner
  ) {}

  @Post()
  @HttpCode(204)
  public receive(@Req() request: CalendarWatchRequest): void {
    const result = this.planner.plan(request.headers);
    if (result.httpStatus === 400) throw new BadRequestException();
    if (result.httpStatus === 404) throw new NotFoundException();
  }
}
