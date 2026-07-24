import { describe, expect, it } from 'vitest';

import {
  PublishScheduleRequestSchema,
  PublishScheduleResponseSchema,
  ScheduleSchema
} from './index.js';

const schedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [
    {
      weekday: 3,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    }
  ],
  dateExceptions: [{ date: '2030-01-06', kind: 'closed' }],
  blockedTimes: { initial: ['13:00'], follow_up: ['13:15'] }
};

const validKey = 'schedule_publish_0001';

describe('schedule contract', () => {
  it('accepts the clinic schedule shape', () => {
    expect(ScheduleSchema.parse(schedule)).toEqual(schedule);
  });

  // 網格以台北時間定義，domain 也只接受這一個值；契約直接釘住，而不是收下一個
  // 之後才會被 planner 拒絕的時區。
  it('pins the schedule to the clinic time zone', () => {
    expect(
      ScheduleSchema.safeParse({ ...schedule, timeZone: 'UTC' }).success
    ).toBe(false);
  });

  it.each([
    ['a weekday outside 0-6', { weekday: 7, intervals: [] }],
    ['a non-integer weekday', { weekday: 1.5, intervals: [] }]
  ])('rejects %s', (_caseName, entry) => {
    expect(
      ScheduleSchema.safeParse({ ...schedule, weeklyAvailability: [entry] })
        .success
    ).toBe(false);
  });

  it('rejects clock times that are not HH:MM and days with no interval', () => {
    expect(
      ScheduleSchema.safeParse({
        ...schedule,
        weeklyAvailability: [
          {
            weekday: 3,
            intervals: [{ startLocalTime: '9:00', endLocalTime: '20:30' }]
          }
        ]
      }).success
    ).toBe(false);
    expect(
      ScheduleSchema.safeParse({
        ...schedule,
        weeklyAvailability: [{ weekday: 3, intervals: [] }]
      }).success
    ).toBe(false);
  });

  // 排班沒有任何欄位可以放進患者資料，free text 也不例外。
  it.each([
    ['free text', { note: 'Mrs Wang cannot come on Fridays' }],
    ['client actor', { actorId: 'admin_001' }],
    ['client time', { publishedAt: '2026-07-24T09:00:00.000Z' }]
  ])('rejects %s anywhere in the schedule', (_caseName, extraField) => {
    expect(
      ScheduleSchema.safeParse({ ...schedule, ...extraField }).success
    ).toBe(false);
  });
});

describe('publish schedule command', () => {
  it('carries the key, the version being replaced and the draft', () => {
    expect(
      PublishScheduleRequestSchema.parse({
        idempotencyKey: validKey,
        expectedVersion: 3,
        schedule
      }).expectedVersion
    ).toBe(3);
  });

  // 少了 expectedVersion，兩位同時編輯的管理者中後發布的一方會靜默覆蓋前一位。
  it('refuses a publication that does not state the version it replaces', () => {
    expect(
      PublishScheduleRequestSchema.safeParse({
        idempotencyKey: validKey,
        schedule
      }).success
    ).toBe(false);
    expect(
      PublishScheduleRequestSchema.safeParse({
        idempotencyKey: validKey,
        expectedVersion: -1,
        schedule
      }).success
    ).toBe(false);
  });

  it('returns the server-resolved version, time and slot count', () => {
    expect(
      PublishScheduleResponseSchema.parse({
        publishedVersion: 4,
        publishedAt: '2026-07-24T09:00:00.000Z',
        slotCount: 312
      }).publishedVersion
    ).toBe(4);
    expect(
      PublishScheduleResponseSchema.safeParse({
        publishedVersion: 4,
        publishedAt: '2026-07-24T17:00:00+08:00',
        slotCount: 312
      }).success
    ).toBe(false);
  });
});
