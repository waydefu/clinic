import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Post,
  Res
} from '@nestjs/common';
import { z } from 'zod';

import {
  calendarPilotSessionClearCookie,
  calendarPilotSessionSetCookie,
  readCalendarPilotSessionCookie,
  type CalendarPilotSessionService
} from './calendar-pilot-session.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { CALENDAR_PILOT_SESSIONS } from '../calendar/calendar-pilot.tokens.js';

interface HeaderReply {
  header(name: string, value: string): void;
}

const SessionRequestSchema = z
  .object({ idToken: z.string().min(100).max(20_000) })
  .strict();

@Controller('calendar-session')
export class CalendarPilotSessionController {
  public constructor(
    @Inject(CALENDAR_PILOT_SESSIONS)
    private readonly sessions: CalendarPilotSessionService
  ) {}

  @Get('client-config')
  public clientConfig() {
    const apiKey = process.env['CALENDAR_PILOT_FIREBASE_WEB_API_KEY'];
    const authDomain = process.env['CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN'];
    const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
    if (
      apiKey === undefined ||
      authDomain === undefined ||
      projectId === undefined
    )
      throw new AuthenticationRequiredError();
    return { apiKey, authDomain, projectId };
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: HeaderReply
  ) {
    const session = await this.sessions.create(
      SessionRequestSchema.parse(body).idToken
    );
    reply.header(
      'Set-Cookie',
      calendarPilotSessionSetCookie(
        session.cookieValue,
        session.cookieMaxAgeSeconds
      )
    );
    return {
      csrfToken: session.csrfToken,
      role: session.authentication.actorRole
    };
  }

  @Delete()
  public async destroy(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) reply: HeaderReply
  ) {
    const sessionCookie = readCalendarPilotSessionCookie(cookieHeader);
    if (sessionCookie !== undefined) await this.sessions.revoke(sessionCookie);
    reply.header('Set-Cookie', calendarPilotSessionClearCookie());
    return { signedOut: true };
  }
}
