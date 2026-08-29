import {
  Inject,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';

import type { CalendarPilotAuthenticatedRequest } from '../calendar/calendar-pilot.controller.js';
import {
  CALENDAR_PILOT_COOKIE,
  type CalendarPilotSessionService
} from './calendar-pilot-session.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { CALENDAR_PILOT_SESSIONS } from '../calendar/calendar-pilot.tokens.js';

interface ProtectedRequest extends CalendarPilotAuthenticatedRequest {
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  calendarPilotAuthentication: CalendarPilotAuthenticatedRequest['calendarPilotAuthentication'];
}

function cookieValue(
  header: string | string[] | undefined,
  name: string
): string | undefined {
  const raw = Array.isArray(header) ? header.join(';') : header;
  if (raw === undefined) return undefined;
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export class CalendarPilotSessionGuard implements CanActivate {
  public constructor(
    @Inject(CALENDAR_PILOT_SESSIONS)
    private readonly sessions: CalendarPilotSessionService
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProtectedRequest>();
    const sessionCookie = cookieValue(
      request.headers['cookie'],
      CALENDAR_PILOT_COOKIE
    );
    if (sessionCookie === undefined) throw new AuthenticationRequiredError();
    const authentication = await this.sessions.authenticate(sessionCookie);
    if (request.method.toUpperCase() !== 'GET') {
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string') throw new AuthenticationRequiredError();
      await this.sessions.assertCsrf(authentication.sessionId, csrf);
    }
    request.calendarPilotAuthentication = {
      actorId: authentication.actorId,
      actorRole: authentication.actorRole
    };
    return true;
  }
}
