import type {
  GetPublishedScheduleResponse,
  ListSlotsResponse,
  PublishScheduleRequest,
  PublishScheduleResponse,
  Schedule as ContractSchedule
} from '@beauessence/contracts';
import { ScheduleSchema } from '@beauessence/contracts';
import {
  DomainError,
  internalTestSlotGeneration,
  listPublishedGrid,
  SLOT_DURATION_MINUTES,
  type AuditContext,
  type BookingKind,
  type Schedule as DomainSchedule
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { ApplicationClock } from '../appointments/appointment.application-service.js';
import { publishScheduleIdempotency } from '../idempotency/schedule-idempotency.js';
import type { ScheduleAuthorizationPolicy } from './schedule.policy.js';
import type { ScheduleRepositoryPort } from './schedule.repository-port.js';

export interface ScheduleCorrelationIdGenerator {
  next(): string;
}

function auditContext(
  authentication: AuthenticationContext,
  correlationId: string
): AuditContext {
  return {
    actorId: authentication.actorId,
    actorRole: authentication.actorRole,
    correlationId,
    source: 'api',
    reasonCode: null,
    policyVersion: null
  };
}

function toDomainSchedule(schedule: ContractSchedule): DomainSchedule {
  return {
    timeZone: schedule.timeZone,
    weeklyAvailability: schedule.weeklyAvailability,
    dateExceptions: schedule.dateExceptions.map((entry) =>
      entry.intervals === undefined
        ? { date: entry.date, kind: entry.kind }
        : { date: entry.date, kind: entry.kind, intervals: entry.intervals }
    ),
    ...(schedule.blockedTimes === undefined
      ? {}
      : { blockedTimes: schedule.blockedTimes })
  };
}

function toContractSchedule(
  schedule: DomainSchedule | null
): ContractSchedule | null {
  if (schedule === null) return null;
  return ScheduleSchema.parse({
    timeZone: 'Asia/Taipei',
    weeklyAvailability: schedule.weeklyAvailability,
    dateExceptions: schedule.dateExceptions.map((entry) =>
      entry.intervals === undefined
        ? { date: entry.date, kind: entry.kind }
        : {
            date: entry.date,
            kind: entry.kind,
            intervals: [...entry.intervals]
          }
    ),
    ...(schedule.blockedTimes === undefined
      ? {}
      : {
          blockedTimes: {
            initial: [...(schedule.blockedTimes.initial ?? [])],
            follow_up: [...(schedule.blockedTimes.follow_up ?? [])]
          }
        })
  });
}

export class ScheduleApplicationService {
  public constructor(
    private readonly repository: ScheduleRepositoryPort,
    private readonly authorization: ScheduleAuthorizationPolicy,
    private readonly clock: ApplicationClock,
    private readonly correlations: ScheduleCorrelationIdGenerator
  ) {}

  public async publish(
    command: PublishScheduleRequest,
    authentication: AuthenticationContext
  ): Promise<PublishScheduleResponse> {
    await this.authorization.assertCanPublish(authentication);
    const requestedAt = this.clock.nowUtc();
    const draft = toDomainSchedule(command.schedule);
    const result = await this.repository.publish({
      draft,
      expectedVersion: command.expectedVersion,
      slotGeneration: internalTestSlotGeneration(requestedAt),
      audit: auditContext(authentication, this.correlations.next()),
      requestedAt,
      idempotency: publishScheduleIdempotency({
        key: command.idempotencyKey,
        actorId: authentication.actorId,
        expectedVersion: command.expectedVersion,
        schedule: draft
      })
    });
    return {
      publishedVersion: result.publishedVersion,
      publishedAt: result.publishedAt,
      slotCount: result.slotCount
    };
  }

  public async read(
    authentication: AuthenticationContext
  ): Promise<GetPublishedScheduleResponse> {
    await this.authorization.assertCanReadGrid(authentication);
    const published = await this.repository.readPublished();
    return {
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt,
      schedule: toContractSchedule(published.schedule)
    };
  }

  public async listSlots(
    authentication: AuthenticationContext,
    kind?: BookingKind
  ): Promise<ListSlotsResponse> {
    await this.authorization.assertCanReadGrid(authentication);
    const published = await this.repository.readPublished();
    if (published.schedule === null) return { slots: [] };
    const occupied = await this.repository.listOccupiedSlots();
    const requestedAt = this.clock.nowUtc();
    return {
      slots: listPublishedGrid(
        published.schedule,
        occupied,
        requestedAt,
        kind
      ).map((slot) => ({
        slotId: slot.id,
        kind: slot.kind,
        startsAt: slot.startsAt,
        endsAt: new Date(
          Date.parse(slot.startsAt) + SLOT_DURATION_MINUTES * 60_000
        ).toISOString(),
        available: slot.reservationId === undefined
      }))
    };
  }
}

export function assertInternalTestSlotKind(
  value: string | undefined
): BookingKind | undefined {
  if (value === undefined || value === '') return undefined;
  if (value !== 'initial' && value !== 'follow_up') {
    throw new DomainError('INVALID_VALUE', 'Unknown booking kind.');
  }
  return value;
}
