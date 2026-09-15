import type { Firestore } from 'firebase-admin/firestore';
import type { DeniedAccessAuditEvent } from '@beauessence/domain';

import type { DeniedAuthorizationAuditPort } from '../platform/authorization/denied-access-audit.port.js';

export const AUTHORIZATION_DENIAL_COLLECTION = 'authorization_denial_events';

export class FirestoreDeniedAccessAuditStore implements DeniedAuthorizationAuditPort {
  public constructor(private readonly db: Firestore) {}

  public async record(event: DeniedAccessAuditEvent): Promise<void> {
    await this.db
      .collection(AUTHORIZATION_DENIAL_COLLECTION)
      .doc(event.eventId)
      .create({
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        actorType: event.actorType,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        outcome: event.outcome,
        reasonCategory: event.reasonCategory,
        correlationId: event.correlationId,
        environment: event.environment
      });
  }
}
