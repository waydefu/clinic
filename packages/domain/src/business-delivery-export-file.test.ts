import { describe, expect, it } from 'vitest';

import {
  BUSINESS_EXPORT_COLUMNS,
  BUSINESS_EXPORT_FIELDS,
  planBusinessDataExport,
  renderBusinessExportCsvFile,
  toBusinessExportRow
} from './business-delivery-export.js';
import { resolveApprovedBusinessDeliveryPolicy } from './business-delivery-policy.js';

const FULL = {
  name: '合成患者甲',
  phoneDigits: '0912000001',
  birthMonthDay: '--05-20',
  nationality: 'domestic',
  startsAt: '2030-01-02T04:00:00.000Z',
  bookingKind: 'initial',
  itemId: 'service_snoring',
  status: 'confirmed',
  patientNote: '合成備註'
};

describe('BD-POLICY-2026-09-29 export limits', () => {
  it('allows CSV only, 24 h, 3 downloads and 7-day retention', () => {
    const policy = resolveApprovedBusinessDeliveryPolicy(
      'BD-POLICY-2026-09-29',
      'internal_synthetic'
    );
    expect(policy.export).toEqual({
      formats: ['csv'],
      downloadWindowHours: 24,
      maxDownloads: 3,
      fileRetentionDays: 7,
      maxRangeDays: 366
    });
  });
});

describe('BUSINESS_EXPORT_COLUMNS', () => {
  it('lists exactly the approved columns in file order', () => {
    expect(BUSINESS_EXPORT_FIELDS).toEqual([
      'name',
      'phone',
      'birthMonthDay',
      'nationality',
      'startsAt',
      'bookingKind',
      'service',
      'status',
      'patientNote'
    ]);
    expect(BUSINESS_EXPORT_COLUMNS.map((column) => column.label)).toContain(
      '備註'
    );
  });

  it('is a valid allowlist for the existing export planner', () => {
    expect(
      planBusinessDataExport({
        format: 'csv',
        requestedFields: BUSINESS_EXPORT_FIELDS,
        allowedFields: BUSINESS_EXPORT_FIELDS,
        proof: {
          scopeId: 'scope_c1',
          requestId: 'req_001',
          authorizationReference: 'auth_001',
          reauthenticationReference: 'reauth_001',
          authorized: true,
          reauthenticated: true
        }
      }).fields
    ).toEqual(BUSINESS_EXPORT_FIELDS);
  });
});

describe('toBusinessExportRow', () => {
  it('formats every approved column in Traditional Chinese and Taipei time', () => {
    expect(toBusinessExportRow(FULL)).toEqual({
      name: '合成患者甲',
      phone: '0912-000-001',
      birthMonthDay: '05-20',
      nationality: '本國',
      startsAt: '2030-01-02 12:00',
      bookingKind: '初診',
      service: '止鼾',
      status: '已預約',
      patientNote: '合成備註'
    });
  });

  it('groups a landline so spreadsheets keep the leading zero', () => {
    expect(
      toBusinessExportRow({ ...FULL, phoneDigits: '0225771314' }).phone
    ).toBe('02-25771314');
  });

  it('leaves values the server does not hold blank instead of guessing', () => {
    expect(toBusinessExportRow({ name: '合成患者乙' })).toEqual({
      name: '合成患者乙',
      phone: null,
      birthMonthDay: null,
      nationality: null,
      startsAt: null,
      bookingKind: null,
      service: null,
      status: null,
      patientNote: null
    });
  });

  it('never prints a year even if a full date slipped into storage', () => {
    expect(
      toBusinessExportRow({ ...FULL, birthMonthDay: '1990-05-20' })
        .birthMonthDay
    ).toBeNull();
  });
});

describe('renderBusinessExportCsvFile', () => {
  it('writes a BOM, Chinese headers and one row per record', () => {
    const csv = renderBusinessExportCsvFile({
      rows: [toBusinessExportRow(FULL)]
    });
    const lines = csv.split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe(
      '﻿姓名,電話,生日（月-日）,國籍,預約時間（台北）,初診／回診,服務,狀態,備註'
    );
    expect(lines[1]).toBe(
      '合成患者甲,0912-000-001,05-20,本國,2030-01-02 12:00,初診,止鼾,已預約,合成備註'
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
  });

  it('neutralises formula-like notes and quotes commas and newlines', () => {
    const csv = renderBusinessExportCsvFile({
      rows: [
        toBusinessExportRow({ ...FULL, patientNote: '=HYPERLINK("x")' }),
        toBusinessExportRow({ ...FULL, patientNote: '甲,乙\n丙' })
      ]
    });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"甲,乙\n丙"');
  });

  it('writes only the header for an empty range', () => {
    expect(
      renderBusinessExportCsvFile({ rows: [] }).split('\r\n')
    ).toHaveLength(2);
  });
});

describe('taipeiDateRange', () => {
  it('covers whole Taipei days as a half-open UTC range', async () => {
    const { taipeiDateRange } = await import('./business-delivery-policy.js');
    expect(
      taipeiDateRange({ from: '2030-01-01', to: '2030-01-31', maxDays: 366 })
    ).toEqual({
      startAt: '2029-12-31T16:00:00.000Z',
      endAt: '2030-01-31T16:00:00.000Z',
      days: 31
    });
  });

  it('rejects an inverted, impossible or over-long range', async () => {
    const { taipeiDateRange } = await import('./business-delivery-policy.js');
    for (const [from, to] of [
      ['2030-02-01', '2030-01-31'],
      ['2030-02-30', '2030-03-01'],
      ['2030-01-01', '2031-01-02']
    ])
      expect(() => taipeiDateRange({ from, to, maxDays: 366 })).toThrow();
  });
});
