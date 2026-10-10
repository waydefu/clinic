import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res
} from '@nestjs/common';
import { z } from 'zod';

import {
  calendarPilotSessionClearCookie,
  calendarPilotSessionSetCookie,
  readCalendarPilotSessionCookie,
  type CalendarPilotSessionService
} from './calendar-pilot-session.js';
import type { AuthenticatableRequest } from '../appointments/appointment.controller.js';
import { deriveClientIp } from '../platform/runtime/client-ip.js';
import {
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import {
  isAuthorizedC1FirebaseAuthDomain,
  isIsolatedC1ProjectId
} from '../platform/runtime/c1-firebase-auth-domain.js';
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
    private readonly sessions: CalendarPilotSessionService,
    @Inject(WP_B2_RATE_LIMITER) private readonly rateLimiter: WpB2RateLimiter
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
    if (
      !isIsolatedC1ProjectId(projectId) ||
      !isAuthorizedC1FirebaseAuthDomain(authDomain)
    ) {
      throw new AuthenticationRequiredError();
    }
    return {
      apiKey,
      authDomain: authDomain.trim(),
      projectId: projectId.trim()
    };
  }

  @Get('me')
  public async me(
    @Headers('cookie') cookie: string | undefined,
    @Headers('x-csrf-token') csrf: string | undefined
  ) {
    const value = readCalendarPilotSessionCookie(cookie);
    if (value === undefined || csrf === undefined)
      throw new AuthenticationRequiredError();
    const context = await this.sessions.authenticate(value);
    await this.sessions.assertCsrf(context.sessionId, csrf);
    return { actorId: context.actorId, actorRole: context.actorRole };
  }

  @Post()
  public async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: HeaderReply,
    @Req() request: AuthenticatableRequest
  ) {
    await this.rateLimiter.assertUnauthenticatedIp(deriveClientIp(request));
    const session = await this.sessions.create(
      SessionRequestSchema.parse(body).idToken,
      undefined,
      (actorId) => this.rateLimiter.assertIdentifiedWrite(actorId)
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
    let sessionCookie: string | undefined;
    try {
      sessionCookie = readCalendarPilotSessionCookie(cookieHeader);
    } catch (error) {
      // Invalid input cannot be retried as a valid server credential.
      reply.header('Set-Cookie', calendarPilotSessionClearCookie());
      throw error;
    }
    if (sessionCookie !== undefined) await this.sessions.revoke(sessionCookie);
    // Preserve no-clear on failed server revocation and do not claim logout.
    reply.header('Set-Cookie', calendarPilotSessionClearCookie());
    return { signedOut: true };
  }
}
