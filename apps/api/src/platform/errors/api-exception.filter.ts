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
  routeFamilyFromPath,
  sanitizeStructuredLog,
  type DeniedAccessAuditEvent,
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
import {
  API_METRICS,
  httpMetricFromRequest,
  type ApiMetricsPort
} from '../runtime/api-metrics.js';
import {
  STRUCTURED_LOGGER,
  type StructuredLogger
} from '../runtime/structured-logger.js';

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

/** Bounded append lifecycle. Values are opaque tokens, never PII. */
export const DENIED_AUDIT_APPEND_HEADER = 'x-denied-audit-append';

export type DeniedAuditAppendState = 'recorded' | 'duplicate' | 'failed';

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
    private readonly denials?: DeniedAuthorizationAuditPort,
    @Optional()
    @Inject(API_METRICS)
    private readonly metrics?: ApiMetricsPort,
    @Optional()
    @Inject(STRUCTURED_LOGGER)
    private readonly logger?: StructuredLogger
  ) {}

  public async catch(error: unknown, host: ArgumentsHost): Promise<void> {
    const reply = host.switchToHttp().getResponse<HttpReply>();
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const correlationId = randomUUID();
    const mapped = mapErrorToApiResponse(error, correlationId);
    const path = request.routerPath ?? request.routeOptions?.url ?? 'unknown';
    this.metrics?.recordHttp(
      httpMetricFromRequest({
        method: request.method ?? 'GET',
        path,
        status: mapped.status,
        errorCode: mapped.body.error.code
      })
    );
    try {
      this.logger?.emit(
        sanitizeStructuredLog({
          timestamp: new Date().toISOString(),
          environment: 'internal_test',
          service: 'api',
          correlationId,
          operation: routeTemplate(request),
          result:
            mapped.body.error.code === 'RATE_LIMITED'
              ? 'rate_limited'
              : mapped.body.error.code === 'AUTHORIZATION_DENIED' ||
                  mapped.body.error.code === 'AUTHENTICATION_REQUIRED'
                ? 'denied'
                : 'error',
          errorCode: mapped.body.error.code,
          durationMs: 0,
          retryState: 'none'
        })
      );
    } catch {
      // Logging must never change the HTTP status or body.
    }
    const append = await this.recordDenial(error, request, correlationId);
    for (const [name, value] of Object.entries(mapped.headers))
      reply.header(name, value);
    if (append !== undefined) {
      reply.header(DENIED_AUDIT_APPEND_HEADER, append);
    }
    reply.status(mapped.status).send(mapped.body);
  }

  private async recordDenial(
    error: unknown,
    request: HttpRequest,
    correlationId: string
  ): Promise<DeniedAuditAppendState | undefined> {
    const category = reasonCategory(error);
    if (category === undefined) return undefined;
    if (typeof error === 'object' && error !== null) {
      if (recorded.has(error)) return 'duplicate';
      recorded.add(error);
    }
    if (this.denials === undefined) {
      this.emitAppendFailure(correlationId);
      return 'failed';
    }
    const actor = request.authentication;
    try {
      const event = this.planDenialEvent(
        request,
        correlationId,
        category,
        actor
      );
      await this.denials.record(event);
      return 'recorded';
    } catch {
      this.emitAppendFailure(correlationId);
      return 'failed';
    }
  }

  private planDenialEvent(
    request: HttpRequest,
    correlationId: string,
    category: DeniedAccessReasonCategory,
    actor: HttpRequest['authentication']
  ): DeniedAccessAuditEvent {
    const base = {
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
      resourceType: 'appointment' as const,
      reasonCategory: category,
      correlationId,
      environment: 'internal_test'
    };
    try {
      return planDeniedAccessAudit({
        ...base,
        action: routeTemplate(request)
      });
    } catch {
      const path = request.routerPath ?? request.routeOptions?.url ?? 'unknown';
      return planDeniedAccessAudit({
        ...base,
        action: routeFamilyFromPath(path)
      });
    }
  }

  private emitAppendFailure(correlationId: string): void {
    try {
      this.logger?.emit(
        sanitizeStructuredLog({
          timestamp: new Date().toISOString(),
          environment: 'internal_test',
          service: 'api',
          correlationId,
          operation: 'denied_access_audit',
          result: 'error',
          errorCode: 'INTERNAL_ERROR',
          durationMs: 0,
          retryState: 'none'
        })
      );
    } catch {
      // Failure evidence must never change the HTTP status or body.
    }
    try {
      this.metrics?.recordSignal('denied_audit_append_failure');
    } catch {
      // Metrics must never change the HTTP status or body.
    }
  }
}
