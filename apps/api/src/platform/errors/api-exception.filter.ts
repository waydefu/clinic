import { randomUUID } from 'node:crypto';
import {
  Catch,
  Inject,
  Injectable,
  Optional,
  type ArgumentsHost,
  type ExceptionFilter
} from '@nestjs/common';
import {
  planDeniedAccessAudit,
  type DeniedAccessReasonCategory
} from '@beauessence/domain';

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  CrossPatientDeniedError,
  DisabledAccountError,
  mapErrorToApiResponse
} from './api-error.js';
import {
  DENIED_AUTHORIZATION_AUDIT,
  type DeniedAuthorizationAuditPort
} from '../authorization/denied-access-audit.port.js';

interface HttpReply {
  header(name: string, value: string): HttpReply;
  status(code: number): HttpReply;
  send(body: unknown): void;
}

interface HttpRequest {
  readonly headers?: Record<string, unknown>;
  readonly method?: string;
  readonly routerPath?: string;
  readonly routeOptions?: { readonly url?: string };
  readonly authentication?: {
    readonly actorId?: string;
    readonly actorRole?: string;
  };
}

const recorded = new WeakSet<object>();

function routeTemplate(request: HttpRequest): string {
  const routed = request.routerPath ?? request.routeOptions?.url;
  if (typeof routed === 'string' && /^[A-Za-z0-9/_:-]+$/.test(routed)) {
    return routed.replace(/[/:]/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
  }
  return 'unknown';
}

function reasonCategory(
  error: unknown
): DeniedAccessReasonCategory | undefined {
  if (error instanceof DisabledAccountError) return 'account_disabled';
  if (error instanceof CrossPatientDeniedError) return 'cross_patient';
  if (error instanceof AuthenticationRequiredError)
    return 'authentication_required';
  if (error instanceof AuthorizationDeniedError)
    return 'insufficient_permission';
  return undefined;
}

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(
    @Optional()
    @Inject(DENIED_AUTHORIZATION_AUDIT)
    private readonly denials?: DeniedAuthorizationAuditPort
  ) {}

  public catch(error: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<HttpReply>();
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const correlationId = randomUUID();
    const mapped = mapErrorToApiResponse(error, correlationId);
    void this.recordDenial(error, request, correlationId);
    for (const [name, value] of Object.entries(mapped.headers))
      reply.header(name, value);
    reply.status(mapped.status).send(mapped.body);
  }

  private async recordDenial(
    error: unknown,
    request: HttpRequest,
    correlationId: string
  ): Promise<void> {
    const category = reasonCategory(error);
    if (category === undefined || this.denials === undefined) return;
    if (typeof error === 'object' && error !== null) {
      if (recorded.has(error)) return;
      recorded.add(error);
    }
    const actor = request.authentication;
    try {
      const event = planDeniedAccessAudit({
        eventId: `denial_${correlationId}`,
        occurredAt: new Date().toISOString(),
        actorId:
          typeof actor?.actorId === 'string' && actor.actorId !== ''
            ? actor.actorId
            : 'anonymous',
        actorType:
          typeof actor?.actorRole === 'string' && actor.actorRole !== ''
            ? actor.actorRole
            : 'unauthenticated',
        action: routeTemplate(request),
        resourceType: 'appointment',
        reasonCategory: category,
        correlationId,
        environment: 'internal_test'
      });
      await this.denials.record(event);
    } catch {
      // Denial audit must never change the HTTP status or body.
    }
  }
}
