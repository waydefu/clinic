import { DomainError } from './errors.js';

/**
 * BD-02 export primitives are intentionally policy-neutral. The owner must
 * supply the approved field allowlist and an already-verified authorization /
 * re-authentication proof before an adapter can use this contract.
 */
export type BusinessExportFormat = 'csv' | 'xlsx';
export type BusinessExportCell = string | number | boolean | null;

export interface BusinessExportAuthorizationProof {
  readonly scopeId: string;
  readonly requestId: string;
  readonly authorizationReference: string;
  readonly reauthenticationReference: string;
  readonly authorized: boolean;
  readonly reauthenticated: boolean;
}

export interface BusinessExportPlan {
  readonly format: BusinessExportFormat;
  readonly fields: readonly string[];
  readonly scopeId: string;
  readonly requestId: string;
  readonly authorizationReference: string;
  readonly reauthenticationReference: string;
}

export interface BusinessExportPage {
  readonly sequence: number;
  readonly pageSize: number;
  readonly cursor: string | null;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_EXPORT_PAGE_SIZE = 1000;

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE_IDENTIFIER.test(value)) {
    throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
  }
}

function assertFieldName(value: string): void {
  if (!FIELD_NAME.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      'export field names must be safe identifiers.'
    );
  }
}

function assertUniqueFields(fields: readonly string[]): void {
  if (fields.length === 0) {
    throw new DomainError('INVALID_VALUE', 'export fields must not be empty.');
  }
  const seen = new Set<string>();
  for (const field of fields) {
    assertFieldName(field);
    if (seen.has(field)) {
      throw new DomainError('INVALID_VALUE', 'export fields must be unique.');
    }
    seen.add(field);
  }
}

/**
 * Plans an export only after both authorization and sensitive-operation
 * re-authentication have already been verified by the server boundary.
 * No role is inferred here because Q-EXPORT still belongs to owner policy.
 */
export function planBusinessDataExport(input: {
  readonly format: BusinessExportFormat;
  readonly requestedFields: readonly string[];
  readonly allowedFields: readonly string[];
  readonly proof: BusinessExportAuthorizationProof;
}): BusinessExportPlan {
  assertUniqueFields(input.allowedFields);
  assertUniqueFields(input.requestedFields);
  for (const field of input.requestedFields) {
    if (!input.allowedFields.includes(field)) {
      throw new DomainError(
        'DELEGATION_NOT_AUTHORIZED',
        'the requested export field is not in the approved allowlist.'
      );
    }
  }
  if (!input.proof.authorized || !input.proof.reauthenticated) {
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'export authorization and re-authentication are required.'
    );
  }
  assertOpaque(input.proof.scopeId, 'export.scopeId');
  assertOpaque(input.proof.requestId, 'export.requestId');
  assertOpaque(
    input.proof.authorizationReference,
    'export.authorizationReference'
  );
  assertOpaque(
    input.proof.reauthenticationReference,
    'export.reauthenticationReference'
  );
  if (input.format !== 'csv' && input.format !== 'xlsx') {
    throw new DomainError('INVALID_VALUE', 'export format is unsupported.');
  }
  return {
    format: input.format,
    fields: Object.freeze([...input.requestedFields]),
    scopeId: input.proof.scopeId,
    requestId: input.proof.requestId,
    authorizationReference: input.proof.authorizationReference,
    reauthenticationReference: input.proof.reauthenticationReference
  };
}

/**
 * Validates a bounded page descriptor. Cursor values are opaque and are never
 * interpreted as a patient id, sort key, token, or database document.
 */
export function planBusinessExportPage(input: {
  readonly sequence: number;
  readonly pageSize: number;
  readonly cursor?: string | null;
  readonly nextCursor?: string | null;
  readonly hasMore: boolean;
}): BusinessExportPage {
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new DomainError(
      'INVALID_VALUE',
      'export page sequence must be positive.'
    );
  }
  if (
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > MAX_EXPORT_PAGE_SIZE
  ) {
    throw new DomainError('INVALID_VALUE', 'export page size is out of range.');
  }
  for (const [name, cursor] of [
    ['cursor', input.cursor ?? null],
    ['nextCursor', input.nextCursor ?? null]
  ] as const) {
    if (cursor !== null) assertOpaque(cursor, `export.${name}`);
  }
  if (
    input.hasMore !==
    (input.nextCursor !== undefined && input.nextCursor !== null)
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'export hasMore must agree with nextCursor.'
    );
  }
  return {
    sequence: input.sequence,
    pageSize: input.pageSize,
    cursor: input.cursor ?? null,
    nextCursor: input.nextCursor ?? null,
    hasMore: input.hasMore
  };
}

function safeCellText(value: BusinessExportCell): string {
  if (value === null) return '';
  const text = String(value).replace(/\r\n?/g, '\n');
  // Excel and spreadsheet viewers may execute cells beginning with these
  // characters. Prefixing an apostrophe keeps the value visibly intact while
  // making the exported cell a literal. Leading whitespace is covered too.
  return /^[\t ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: BusinessExportCell): string {
  const text = safeCellText(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Renders one UTF-8 CSV page. The UTF-8 BOM helps spreadsheet applications
 * preserve Traditional Chinese text; values are escaped and formula-safe.
 * Only requested headers are read, so unexpected row fields cannot leak.
 */
export function renderBusinessExportCsvPage(input: {
  readonly fields: readonly string[];
  readonly rows: readonly Readonly<Record<string, BusinessExportCell>>[];
}): string {
  assertUniqueFields(input.fields);
  const lines = [input.fields.map(csvCell).join(',')];
  for (const row of input.rows) {
    lines.push(
      input.fields.map((field) => csvCell(row[field] ?? null)).join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * The approved CP-04 export columns (`BD-POLICY-2026-09-29` §1) in file order,
 * with the Traditional Chinese header each one prints. Field keys stay ASCII
 * so the allowlist checks above apply unchanged.
 */
export const BUSINESS_EXPORT_COLUMNS = Object.freeze([
  Object.freeze({ field: 'name', label: '姓名' }),
  Object.freeze({ field: 'phone', label: '電話' }),
  Object.freeze({ field: 'birthMonthDay', label: '生日（月-日）' }),
  Object.freeze({ field: 'nationality', label: '國籍' }),
  Object.freeze({ field: 'startsAt', label: '預約時間（台北）' }),
  Object.freeze({ field: 'bookingKind', label: '初診／回診' }),
  Object.freeze({ field: 'service', label: '服務' }),
  Object.freeze({ field: 'status', label: '狀態' }),
  Object.freeze({ field: 'patientNote', label: '備註' })
] as const);

export const BUSINESS_EXPORT_FIELDS: readonly string[] = Object.freeze(
  BUSINESS_EXPORT_COLUMNS.map((column) => column.field)
);

const SERVICE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  service_snoring: '止鼾',
  service_aesthetic: '醫美'
});
const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  confirmed: '已預約',
  arrived: '已到診',
  cancellation_requested: '申請取消中',
  cancelled: '已取消',
  completed: '已完成',
  no_show: '未到'
});

/**
 * Excel reads a bare `0912000001` as a number and drops the leading zero, so
 * the export groups digits with hyphens, which spreadsheets keep as text.
 */
function displayPhone(digits: string | undefined): string | null {
  if (digits === undefined || !/^\d{8,20}$/.test(digits)) return null;
  if (/^09\d{8}$/.test(digits))
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function taipeiDateTime(isoUtc: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(isoUtc));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/**
 * Maps one stored appointment and its patient to the approved columns. A
 * value the server does not hold (for example a record created before contact
 * storage) is left blank; nothing is guessed or derived.
 */
export function toBusinessExportRow(input: {
  readonly name?: string;
  readonly phoneDigits?: string;
  readonly birthMonthDay?: string;
  readonly nationality?: string;
  readonly startsAt?: string;
  readonly bookingKind?: string;
  readonly itemId?: string;
  readonly status?: string;
  readonly patientNote?: string;
}): Readonly<Record<string, BusinessExportCell>> {
  const monthDay = /^--(\d{2})-(\d{2})$/.exec(input.birthMonthDay ?? '');
  return {
    name: input.name ?? null,
    phone: displayPhone(input.phoneDigits),
    birthMonthDay: monthDay ? `${monthDay[1]}-${monthDay[2]}` : null,
    nationality:
      input.nationality === 'domestic'
        ? '本國'
        : input.nationality === 'foreign'
          ? '外國'
          : null,
    startsAt:
      input.startsAt !== undefined && !Number.isNaN(Date.parse(input.startsAt))
        ? taipeiDateTime(input.startsAt)
        : null,
    bookingKind:
      input.bookingKind === 'initial'
        ? '初診'
        : input.bookingKind === 'follow_up'
          ? '回診'
          : null,
    service:
      input.itemId === undefined
        ? null
        : (SERVICE_LABELS[input.itemId] ?? input.itemId),
    status:
      input.status === undefined
        ? null
        : (STATUS_LABELS[input.status] ?? input.status),
    patientNote: input.patientNote ?? null
  };
}

/**
 * Renders a complete CSV file whose header row is the approved Chinese labels
 * instead of the field keys. Same escaping and formula protection as the page
 * renderer. Phones are hyphen-grouped by `toBusinessExportRow`.
 */
export function renderBusinessExportCsvFile(input: {
  readonly rows: readonly Readonly<Record<string, BusinessExportCell>>[];
}): string {
  const page = renderBusinessExportCsvPage({
    fields: BUSINESS_EXPORT_FIELDS,
    rows: input.rows
  });
  const header = BUSINESS_EXPORT_COLUMNS.map((column) =>
    csvCell(column.label)
  ).join(',');
  const firstBreak = page.indexOf('\r\n');
  return `\uFEFF${header}${page.slice(firstBreak)}`;
}
