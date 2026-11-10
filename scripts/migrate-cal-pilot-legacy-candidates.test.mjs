import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectLegacyCalendarCandidates,
  migrateLegacyCalendarCandidates,
  verifyLegacyCalendarCandidateRegeneration
} from './migrate-cal-pilot-legacy-candidates.mjs';

const request = {
  projectId: 'beauessence-clinic-staging',
  expectedCount: 1,
  expectedSourceGeneration: 1
};
const expiry = Date.parse('2026-11-28T04:51:37Z');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('CAL-PILOT migration expiry', () => {
  it('permits pre-expiry inspection to reach only the synthetic adapter', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(expiry - 1);
    const collection = vi.fn(() => {
      throw new Error('synthetic adapter reached');
    });
    await expect(
      inspectLegacyCalendarCandidates({ ...request, db: { collection } })
    ).rejects.toThrow('synthetic adapter reached');
    expect(collection).toHaveBeenCalledOnce();
  });

  it('refuses the transaction if expiry passes after preflight', async () => {
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValueOnce(expiry - 1);
    clock.mockReturnValue(expiry);
    const configuration = {
      expiresAt: '2026-11-28T04:51:37Z',
      version: 1,
      activeSourceId: 'synthetic_primary',
      inboundEnabled: false,
      outboundEnabled: false
    };
    const snapshots = {
      calendar_pilot_configuration: { exists: true, data: () => configuration },
      calendar_pilot_sources: {
        docs: [{ id: 'synthetic_primary' }, { id: 'synthetic_secondary' }]
      },
      calendar_pilot_candidates: {
        docs: [
          { id: 'synthetic_candidate', data: () => ({ kind: 'invalid_format' }) }
        ]
      }
    };
    const transaction = { get: vi.fn(), update: vi.fn(), delete: vi.fn() };
    const db = {
      collection: vi.fn((name) => ({
        doc: () => ({ get: async () => snapshots[name] }),
        where: () => ({ get: async () => snapshots[name] })
      })),
      runTransaction: vi.fn((callback) => callback(transaction))
    };
    await expect(
      migrateLegacyCalendarCandidates({ ...request, db })
    ).rejects.toThrow('CAL-PILOT migration authority has expired.');
    expect(db.runTransaction).toHaveBeenCalledOnce();
    expect(transaction.get).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it.each([expiry, expiry + 1, Number.NaN])(
    'refuses expired or invalid clock %s before any adapter call',
    async (now) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.stubEnv('CALENDAR_PILOT_CONFIRM_LEGACY_MIGRATION', 'YES');
      const db = { collection: vi.fn(), runTransaction: vi.fn() };
      for (const operation of [
        inspectLegacyCalendarCandidates,
        migrateLegacyCalendarCandidates,
        verifyLegacyCalendarCandidateRegeneration
      ]) {
        await expect(operation({ ...request, db })).rejects.toThrow(
          'CAL-PILOT migration authority has expired.'
        );
      }
      expect(db.collection).not.toHaveBeenCalled();
      expect(db.runTransaction).not.toHaveBeenCalled();
    }
  );
});
