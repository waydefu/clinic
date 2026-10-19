import { describe, expect, it } from 'vitest';

import {
  activationCopyPageId,
  assertSameCalendarActivationProgress,
  parseCalendarActivationProgress,
  parseCalendarActivationReceipt,
  type CalendarActivationProgress
} from './calendar-pilot-activation.js';

const base: CalendarActivationProgress = {
  version: 1,
  phase: 'copy',
  sourceId: 'active',
  previousSourceId: 'old',
  generation: 0,
  sourceBinding: '0'.repeat(64),
  previousSourceBinding: '1'.repeat(64),
  cutoffAt: '2026-09-01T00:00:00.000Z',
  copyAfter: null,
  receiptCount: 0,
  pendingCopyIds: [],
  cleanupPage: 0,
  cleanupOffset: 0
};
const receipt = {
  version: 1,
  sourceId: 'active',
  previousSourceId: 'old',
  generation: 0,
  sourceBinding: '0'.repeat(64),
  previousSourceBinding: '1'.repeat(64),
  pageIndex: 0,
  recordIds: ['record_001']
};
const copied = {
  ...base,
  copyAfter: {
    startsAt: '2026-09-01T04:00:00.000Z',
    localRecordId: 'record_001'
  },
  pendingCopyIds: ['record_001']
};

describe('bounded activation checkpoint validation', () => {
  it('initialises only absent legacy progress, not corrupt persisted state', () => {
    expect(parseCalendarActivationProgress(undefined)).toBeUndefined();
    expect(() => parseCalendarActivationProgress(null)).toThrow();
    expect(parseCalendarActivationProgress(base)).toEqual(base);
    expect(parseCalendarActivationProgress(copied)).toEqual(copied);
  });

  it('preserves generation zero and exact cursor values', () => {
    expect(parseCalendarActivationProgress(copied)).toMatchObject({
      generation: 0,
      copyAfter: copied.copyAfter
    });
    expect(parseCalendarActivationReceipt(receipt)).toEqual(receipt);
  });

  it.each([
    { version: 2 },
    { phase: 'done' },
    { generation: -1 },
    { generation: 1.5 },
    { sourceBinding: 'not-a-binding' },
    { previousSourceBinding: undefined },
    { sourceBinding: base.previousSourceBinding },
    { sourceId: 'old' },
    { sourceId: 'bad/path' },
    { sourceId: '\uD800' },
    { cutoffAt: 'invalid' },
    { cutoffAt: '2026-02-30T00:00:00Z' },
    { receiptCount: -1 },
    { receiptCount: Number.POSITIVE_INFINITY },
    { cleanupPage: 1 },
    { cleanupOffset: 1 },
    { copyAfter: {} },
    { pendingCopyIds: ['record_001'] }
  ])('fails closed on malformed initial progress: %j', (change) => {
    expect(() =>
      parseCalendarActivationProgress({ ...base, ...change })
    ).toThrow();
  });

  it('bounds pending IDs and requires a cursor matching the acknowledged suffix', () => {
    expect(() =>
      parseCalendarActivationProgress({
        ...copied,
        pendingCopyIds: Array.from({ length: 20 }, () => 'record_001')
      })
    ).toThrow();
    expect(() =>
      parseCalendarActivationProgress({
        ...copied,
        pendingCopyIds: ['different']
      })
    ).toThrow();
    expect(() =>
      parseCalendarActivationProgress({
        ...copied,
        copyAfter: { ...copied.copyAfter, startsAt: '2026-08-01T00:00:00.000Z' }
      })
    ).toThrow();
    expect(() =>
      parseCalendarActivationProgress({ ...copied, phase: 'cleanup' })
    ).toThrow();
  });

  it('accepts a bounded cleanup checkpoint, including the acknowledged end of a full page', () => {
    const cleanup = {
      ...copied,
      phase: 'cleanup',
      pendingCopyIds: [],
      receiptCount: 2,
      cleanupOffset: 20
    };
    expect(parseCalendarActivationProgress(cleanup)).toEqual(cleanup);
    expect(() =>
      parseCalendarActivationProgress({ ...cleanup, cleanupOffset: 21 })
    ).toThrow();
    expect(() =>
      parseCalendarActivationProgress({ ...cleanup, cleanupPage: 2 })
    ).toThrow();
    expect(
      parseCalendarActivationProgress({
        ...cleanup,
        cleanupPage: 2,
        cleanupOffset: 0
      })
    ).toBeDefined();
  });

  it.each([
    { version: 2 },
    { generation: -1 },
    { pageIndex: -1 },
    { recordIds: [] },
    { recordIds: Array.from({ length: 21 }, () => 'record_001') },
    { recordIds: ['bad/path'] },
    { recordIds: ['\uDFFF'] },
    { recordIds: ['é'.repeat(751)] }
  ])('rejects invalid or oversized copy receipts: %j', (change) => {
    expect(() =>
      parseCalendarActivationReceipt({ ...receipt, ...change })
    ).toThrow();
  });

  it('accepts a full receipt and does not normalise opaque identifiers', () => {
    const full = {
      ...receipt,
      recordIds: Array.from({ length: 20 }, (_, index) => `record_${index}`)
    };
    expect(parseCalendarActivationReceipt(full)).toEqual(full);
  });

  it('compares canonical fields rather than Firestore map insertion order', () => {
    const reordered = Object.fromEntries(Object.entries(copied).reverse());
    expect(() =>
      assertSameCalendarActivationProgress(copied, reordered)
    ).not.toThrow();
    expect(() =>
      assertSameCalendarActivationProgress(undefined, undefined)
    ).not.toThrow();
    expect(() => assertSameCalendarActivationProgress(undefined, base)).toThrow(
      /changed/u
    );
    expect(() => assertSameCalendarActivationProgress(base, copied)).toThrow(
      /changed/u
    );
    expect(() =>
      assertSameCalendarActivationProgress(copied, { ...copied, generation: 1 })
    ).toThrow(/changed/u);
    expect(() =>
      assertSameCalendarActivationProgress(undefined, null)
    ).toThrow();
  });

  it('does not grant authority to unknown fields', () => {
    expect(
      parseCalendarActivationProgress({ ...base, forceCleanup: true })
    ).toEqual(base);
  });

  it('uses stable bounded-width receipt IDs and rejects ambiguous indices', () => {
    expect(activationCopyPageId(0)).toBe('0000000000000000');
    expect(activationCopyPageId(11)).toBe('0000000000000011');
    expect(activationCopyPageId(2) < activationCopyPageId(11)).toBe(true);
    for (const index of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => activationCopyPageId(index)).toThrow();
  });
});
