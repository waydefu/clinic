import type { DeniedAccessAuditEvent } from '@beauessence/domain';

export const DENIED_AUTHORIZATION_AUDIT = 'DeniedAuthorizationAuditPort';

export interface DeniedAuthorizationAuditPort {
  record(event: DeniedAccessAuditEvent): Promise<void>;
}

export class InMemoryDeniedAccessAuditSink implements DeniedAuthorizationAuditPort {
  private readonly events: DeniedAccessAuditEvent[] = [];
  private readonly seen = new Set<string>();

  public record(event: DeniedAccessAuditEvent): Promise<void> {
    const dedupeKey = `${event.correlationId}:${event.reasonCategory}:${event.action}`;
    if (this.seen.has(dedupeKey)) return Promise.resolve();
    this.seen.add(dedupeKey);
    this.events.push(event);
    return Promise.resolve();
  }

  public list(): readonly DeniedAccessAuditEvent[] {
    return this.events;
  }
}
