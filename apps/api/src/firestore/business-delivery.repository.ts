import { createHash } from 'node:crypto';

import {
  assertMilestoneAcknowledgementAllowed,
  type ApprovedBusinessDeliveryPolicy,
  type BusinessMilestoneAcknowledgements,
  type BusinessMilestoneId,
  type BusinessReportEvent
} from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import {
  BUSINESS_DELIVERY_COLLECTIONS,
  FIRST_ELIGIBLE_USE_DOC,
  MILESTONE_ACKNOWLEDGEMENTS_DOC,
  staffUsageCaptureGapDocumentId
} from '../business-delivery/usage-events.js';
import { ConflictError } from '../platform/errors/api-error.js';

export const MILESTONE_ACKNOWLEDGEMENT_LOG = 'bd_milestone_acknowledgement_log';

export interface MilestoneState {
  readonly revision: number;
  readonly firstEligibleUseAt?: string;
  readonly acknowledgements: BusinessMilestoneAcknowledgements;
}

export interface AcknowledgeMilestoneCommand {
  readonly milestoneId: BusinessMilestoneId;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly evidenceRef: string;
  readonly launchDate?: string;
  /** sha256 of the server-verified staff UID. */
  readonly actorRef: string;
  readonly now: string;
  readonly policy: ApprovedBusinessDeliveryPolicy;
}

interface StoredAcknowledgement {
  readonly evidenceRef: string;
  readonly launchDate?: string;
  readonly acknowledgedAt: string;
  readonly actorRef: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly policyVersion: string;
}

interface StoredAcknowledgements {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly formal_launch?: StoredAcknowledgement;
  readonly final_payment?: StoredAcknowledgement;
}

function requestHash(command: AcknowledgeMilestoneCommand): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        command.milestoneId,
        command.evidenceRef,
        command.launchDate ?? null
      ])
    )
    .digest('hex');
}

function toDomain(
  stored: StoredAcknowledgements | undefined
): BusinessMilestoneAcknowledgements {
  const launchDate = stored?.formal_launch?.launchDate;
  const acknowledgedAt = stored?.final_payment?.acknowledgedAt;
  return {
    ...(launchDate === undefined ? {} : { formalLaunch: { launchDate } }),
    ...(acknowledgedAt === undefined
      ? {}
      : { finalPayment: { acknowledgedAt } })
  };
}

function isUsageEvent(value: unknown): value is {
  readonly eventId: string;
  readonly kind: 'staff_login' | 'booking_created';
  readonly eventClass: 'runtime' | 'maintenance';
  readonly occurredAt: string;
  readonly actorRef?: string;
} {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record['schemaVersion'] === 1 &&
    typeof record['eventId'] === 'string' &&
    (record['kind'] === 'staff_login' ||
      record['kind'] === 'booking_created') &&
    (record['eventClass'] === 'runtime' ||
      record['eventClass'] === 'maintenance') &&
    typeof record['occurredAt'] === 'string'
  );
}

/**
 * Reads CP-03 usage and milestone state and applies owner confirmations.
 * Holds no business rule: completeness, classification and milestone
 * preconditions come from `@beauessence/domain`.
 */
export class FirestoreBusinessDeliveryRepository {
  public constructor(private readonly db: Firestore) {}

  /** Events in `[startAt, endAt)`; an unreadable record fails the report. */
  public async usageEventsBetween(
    startAt: string,
    endAt: string
  ): Promise<BusinessReportEvent[]> {
    const snapshot = await this.db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.usageEvents)
      .where('occurredAt', '>=', startAt)
      .where('occurredAt', '<', endAt)
      .get();
    return snapshot.docs.map((document) => {
      const data: unknown = document.data();
      if (!isUsageEvent(data) || data.eventId !== document.id) {
        throw new Error('Unreadable business-delivery usage event.');
      }
      return {
        eventId: data.eventId,
        occurredAt: data.occurredAt,
        kind: data.kind,
        eventClass: data.eventClass,
        ...(data.actorRef === undefined ? {} : { actorId: data.actorRef })
      };
    });
  }

  /**
   * Capture-gap markers are presence-only evidence. Any existing document,
   * including a malformed one, makes that month incomplete.
   */
  public async hasStaffUsageCaptureGap(month: string): Promise<boolean> {
    const snapshot = await this.db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
      .doc(staffUsageCaptureGapDocumentId(month))
      .get();
    return snapshot.exists;
  }

  public async milestoneState(): Promise<MilestoneState> {
    const collection = this.db.collection(
      BUSINESS_DELIVERY_COLLECTIONS.milestones
    );
    const [firstUse, acknowledgements] = await Promise.all([
      collection.doc(FIRST_ELIGIBLE_USE_DOC).get(),
      collection.doc(MILESTONE_ACKNOWLEDGEMENTS_DOC).get()
    ]);
    const firstUseAt: unknown = firstUse.data()?.['occurredAt'];
    const stored = acknowledgements.data() as
      StoredAcknowledgements | undefined;
    return {
      revision: stored?.revision ?? 0,
      ...(typeof firstUseAt === 'string'
        ? { firstEligibleUseAt: firstUseAt }
        : {}),
      acknowledgements: toDomain(stored)
    };
  }

  /**
   * One transaction: optimistic version check, idempotent replay, domain
   * precondition, the acknowledgement itself and an append-only log record.
   */
  public async acknowledge(
    command: AcknowledgeMilestoneCommand
  ): Promise<{ readonly revision: number; readonly replayed: boolean }> {
    const ref = this.db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
      .doc(MILESTONE_ACKNOWLEDGEMENTS_DOC);
    const hash = requestHash(command);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const stored = snapshot.data() as StoredAcknowledgements | undefined;
      const existing = stored?.[command.milestoneId];
      if (existing?.idempotencyKey === command.idempotencyKey) {
        if (existing.requestHash !== hash) throw new ConflictError();
        return { revision: stored?.revision ?? 0, replayed: true };
      }
      const revision = stored?.revision ?? 0;
      if (revision !== command.expectedVersion) throw new ConflictError();
      assertMilestoneAcknowledgementAllowed({
        milestoneId: command.milestoneId,
        policy: command.policy,
        now: command.now,
        ...(command.launchDate === undefined
          ? {}
          : { launchDate: command.launchDate }),
        acknowledgements: toDomain(stored)
      });
      if (existing !== undefined) throw new ConflictError();

      const entry: StoredAcknowledgement = {
        evidenceRef: command.evidenceRef,
        ...(command.launchDate === undefined
          ? {}
          : { launchDate: command.launchDate }),
        acknowledgedAt: command.now,
        actorRef: command.actorRef,
        idempotencyKey: command.idempotencyKey,
        requestHash: hash,
        policyVersion: command.policy.version
      };
      const next = revision + 1;
      transaction.set(ref, {
        schemaVersion: 1,
        ...stored,
        revision: next,
        [command.milestoneId]: entry
      });
      transaction.create(
        this.db
          .collection(MILESTONE_ACKNOWLEDGEMENT_LOG)
          .doc(`${command.milestoneId}_${command.idempotencyKey}`),
        {
          schemaVersion: 1,
          milestoneId: command.milestoneId,
          revision: next,
          ...entry
        }
      );
      return { revision: next, replayed: false };
    });
  }
}
