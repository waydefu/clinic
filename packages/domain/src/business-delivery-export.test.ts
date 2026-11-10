import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  planBusinessDataExport,
  planBusinessExportPage,
  renderBusinessExportCsvPage
} from './business-delivery-export.js';

const proof = {
  scopeId: 'scope_c1',
  requestId: 'request_001',
  authorizationReference: 'auth_001',
  reauthenticationReference: 'reauth_001',
  authorized: true,
  reauthenticated: true
} as const;

describe('planBusinessDataExport', () => {
  it('requires owner-supplied allowlist plus authorization and re-authentication', () => {
    expect(
      planBusinessDataExport({
        format: 'csv',
        requestedFields: ['bookingId', 'createdAt'],
        allowedFields: ['bookingId', 'createdAt', 'status'],
        proof
      })
    ).toMatchObject({
      format: 'csv',
      fields: ['bookingId', 'createdAt'],
      scopeId: 'scope_c1'
    });
    expect(() =>
      planBusinessDataExport({
        format: 'csv',
        requestedFields: ['bookingId'],
        allowedFields: ['bookingId'],
        proof: { ...proof, reauthenticated: false }
      })
    ).toThrow(DomainError);
  });

  it('rejects fields outside the allowlist and unsafe field names', () => {
    expect(() =>
      planBusinessDataExport({
        format: 'xlsx',
        requestedFields: ['patientName'],
        allowedFields: ['bookingId'],
        proof
      })
    ).toThrow(/allowlist/);
    expect(() =>
      planBusinessDataExport({
        format: 'csv',
        requestedFields: ['bookingId'],
        allowedFields: ['bookingId', 'patient name'],
        proof
      })
    ).toThrow(/safe identifiers/);
  });

  it('is replay-stable for the same opaque request references', () => {
    const input = {
      format: 'csv' as const,
      requestedFields: ['bookingId'],
      allowedFields: ['bookingId'],
      proof
    };
    expect(planBusinessDataExport(input)).toEqual(
      planBusinessDataExport(input)
    );
  });
});

describe('planBusinessExportPage', () => {
  it('requires bounded pages and an honest continuation marker', () => {
    expect(
      planBusinessExportPage({
        sequence: 1,
        pageSize: 100,
        hasMore: true,
        nextCursor: 'cursor_002'
      })
    ).toEqual({
      sequence: 1,
      pageSize: 100,
      cursor: null,
      nextCursor: 'cursor_002',
      hasMore: true
    });
    expect(() =>
      planBusinessExportPage({
        sequence: 1,
        pageSize: 100,
        hasMore: true
      })
    ).toThrow(/hasMore/);
    expect(() =>
      planBusinessExportPage({
        sequence: 1,
        pageSize: 100,
        hasMore: false,
        nextCursor: 'patient-id'
      })
    ).toThrow(/hasMore/);
  });
});

describe('renderBusinessExportCsvPage', () => {
  it('preserves UTF-8, quotes newlines, and prevents formula injection', () => {
    const csv = renderBusinessExportCsvPage({
      fields: ['bookingId', 'note', 'label'],
      rows: [
        {
          bookingId: 'b_001',
          note: 'line one\nline "two"',
          label: '=HYPERLINK("https://example.invalid", "x")'
        }
      ]
    });
    expect(csv.startsWith('\uFEFFbookingId,note,label\r\n')).toBe(true);
    expect(csv).toContain('"line one\nline ""two"""');
    expect(csv).toContain("'\u003dHYPERLINK");
    expect(csv).not.toContain('patient-id');
  });

  it.each([
    ['\n=1+1', `"'\n=1+1"`],
    ['\r\n+1', `"'\n+1"`],
    ['\u00a0@value', "'\u00a0@value"],
    ['\t-1', "'\t-1"]
  ])('neutralises formula following whitespace in %j', (value, expected) => {
    const csv = renderBusinessExportCsvPage({
      fields: ['value'],
      rows: [{ value }]
    });
    expect(csv).toBe(`\uFEFFvalue\r\n${expected}\r\n`);
  });

  it('keeps ordinary multiline text intact while escaping quotes', () => {
    const csv = renderBusinessExportCsvPage({
      fields: ['value'],
      rows: [{ value: 'first, "quoted"\r\nsecond' }]
    });
    expect(csv).toBe('\uFEFFvalue\r\n"first, ""quoted""\nsecond"\r\n');
  });

  it('does not render fields that are not in the requested header list', () => {
    expect(
      renderBusinessExportCsvPage({
        fields: ['bookingId'],
        rows: [{ bookingId: 'b_001', secretField: 'must-not-render' }]
      })
    ).not.toContain('must-not-render');
  });
});
