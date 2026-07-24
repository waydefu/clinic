import { describe, expect, it } from 'vitest';

import {
  FollowUpCategorySchema,
  RecordFollowUpRequestSchema,
  RecordFollowUpResponseSchema
} from './index.js';

const validKey = 'follow_up_request_0001';

describe('record follow-up command', () => {
  it('accepts a required decision with a full target', () => {
    expect(
      RecordFollowUpRequestSchema.parse({
        idempotencyKey: validKey,
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15',
        categories: ['nose_follow_up']
      }).dueTime
    ).toBe('12:15');
  });

  it('accepts a not-required decision with no target at all', () => {
    expect(
      RecordFollowUpRequestSchema.parse({
        idempotencyKey: validKey,
        decision: 'not_required'
      }).decision
    ).toBe('not_required');
  });

  // 半套的目標會產生一個指向不確定時刻的提醒。
  it('refuses a required decision missing either half of the target', () => {
    for (const partial of [{ dueDate: '2030-01-02' }, { dueTime: '12:15' }, {}])
      expect(
        RecordFollowUpRequestSchema.safeParse({
          idempotencyKey: validKey,
          decision: 'required',
          ...partial
        }).success
      ).toBe(false);
  });

  // 帶著目標時間卻說不需要回診，代表呼叫端狀態不一致。伺服器悄悄忽略欄位會讓
  // UI 與稽核各說各話，所以在邊界就擋下。
  it('refuses a not-required decision that still carries a target', () => {
    expect(
      RecordFollowUpRequestSchema.safeParse({
        idempotencyKey: validKey,
        decision: 'not_required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }).success
    ).toBe(false);
  });

  // 回診類別是排程事實，不是臨床註記；自由文字沒有核准的分類（D-001～D-003），
  // 因此契約裡沒有它的位置。
  it('carries only closed follow-up categories and no free text', () => {
    expect(FollowUpCategorySchema.options).toEqual([
      'nose_follow_up',
      'throat_follow_up',
      'half_year_repair'
    ]);
    for (const extraField of [
      { noteText: '病患提到右側鼻塞加重' },
      { certificateCopies: 2 },
      { managerId: 'manager_001' },
      { actorId: 'admin_001' },
      { patientId: 'patient_001' }
    ])
      expect(
        RecordFollowUpRequestSchema.safeParse({
          idempotencyKey: validKey,
          decision: 'not_required',
          ...extraField
        }).success
      ).toBe(false);
  });

  it('returns the server-resolved instant, or null when none is needed', () => {
    expect(
      RecordFollowUpResponseSchema.parse({
        appointmentId: 'appointment_001',
        decision: 'required',
        dueAt: '2030-01-02T04:15:00.000Z'
      }).dueAt
    ).toBe('2030-01-02T04:15:00.000Z');
    expect(
      RecordFollowUpResponseSchema.parse({
        appointmentId: 'appointment_001',
        decision: 'not_required',
        dueAt: null
      }).dueAt
    ).toBeNull();
  });
});
