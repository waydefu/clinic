import type {
  ListSlotsResponse,
  PublishScheduleRequest
} from '@beauessence/contracts';
import type {
  PublishedScheduleSnapshot,
  SchedulePublicationRequest,
  SlotSnapshot
} from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import { ScheduleApplicationService } from './schedule.application-service.js';
import type { ScheduleAuthorizationPolicy } from './schedule.policy.js';
import type {
  PublishedScheduleResult,
  ScheduleRepositoryPort
} from './schedule.repository-port.js';

const SCHEDULE = {
  timeZone: 'Asia/Taipei' as const,
  weeklyAvailability: [
    {
      weekday: 3,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    }
  ],
  dateExceptions: [],
  blockedTimes: { initial: ['13:00'], follow_up: ['13:15'] }
};

const COMMAND: PublishScheduleRequest = {
  idempotencyKey: 'schedule_publish_0001',
  expectedVersion: 0,
  schedule: SCHEDULE
};

const AUTH: AuthenticationContext = {
  actorId: 'actor_manager_001',
  actorRole: 'manager'
};

function createBoundary(
  published: PublishedScheduleSnapshot = {
    publishedVersion: 0,
    publishedAt: null,
    schedule: null
  },
  occupied: readonly SlotSnapshot[] = []
) {
  const publish = vi.fn<
    (request: SchedulePublicationRequest) => Promise<PublishedScheduleResult>
  >(() =>
    Promise.resolve({
      publishedVersion: 1,
      publishedAt: '2029-12-15T09:00:00.000Z',
      slotCount: 12,
      replayed: false
    })
  );
  const readPublished = vi.fn(() => Promise.resolve(published));
  const listOccupiedSlots = vi.fn(() => Promise.resolve(occupied));
  const assertCanPublish = vi.fn(() => Promise.resolve());
  const assertCanReadGrid = vi.fn(() => Promise.resolve());
  const repository: ScheduleRepositoryPort = {
    publish,
    readPublished,
    listOccupiedSlots
  };
  const authorization: ScheduleAuthorizationPolicy = {
    assertCanPublish,
    assertCanReadGrid
  };
  const service = new ScheduleApplicationService(
    repository,
    authorization,
    { nowUtc: () => '2029-12-15T09:00:00.000Z' },
    { next: () => 'corr_schedule_001' }
  );
  return {
    service,
    publish,
    assertCanPublish,
    assertCanReadGrid,
    readPublished
  };
}

describe('ScheduleApplicationService', () => {
  it('publishes with server-owned audit and the IP-001 horizon window', async () => {
    const { service, publish, assertCanPublish } = createBoundary();
    await expect(service.publish(COMMAND, AUTH)).resolves.toEqual({
      publishedVersion: 1,
      publishedAt: '2029-12-15T09:00:00.000Z',
      slotCount: 12
    });
    expect(assertCanPublish).toHaveBeenCalledWith(AUTH);
    const request = publish.mock.calls[0]?.[0];
    expect(request?.expectedVersion).toBe(0);
    expect(request?.draft).toEqual(SCHEDULE);
    expect(request?.slotGeneration.startDate).toBe('2029-12-15');
    expect(request?.slotGeneration.dayCount).toBe(32);
    expect(request?.audit.actorId).toBe(AUTH.actorId);
    expect(request?.audit.policyVersion).toBeNull();
  });

  it('returns an empty slot list before anything is published', async () => {
    const { service, assertCanReadGrid } = createBoundary();
    const listed: ListSlotsResponse = await service.listSlots(AUTH, 'initial');
    expect(listed).toEqual({ slots: [] });
    expect(assertCanReadGrid).toHaveBeenCalledWith(AUTH);
  });

  it('lists occupancy without reservation identifiers', async () => {
    const { service } = createBoundary(
      {
        publishedVersion: 1,
        publishedAt: '2029-12-15T09:00:00.000Z',
        schedule: SCHEDULE
      },
      [
        {
          id: 'slot_20300102_1230',
          kind: 'initial',
          startsAt: '2030-01-02T04:30:00.000Z',
          reservationId: 'appointment_001'
        }
      ]
    );
    const listed = await service.listSlots(AUTH, 'initial');
    const occupied = listed.slots.find(
      (slot) => slot.slotId === 'slot_20300102_1230'
    );
    expect(occupied?.available).toBe(false);
    expect(occupied).not.toHaveProperty('reservationId');
    expect(listed.slots.every((slot) => slot.kind === 'initial')).toBe(true);
  });
});
