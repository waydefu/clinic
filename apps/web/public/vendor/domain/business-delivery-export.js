import { DomainError } from './errors.js';
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_EXPORT_PAGE_SIZE = 1000;
function assertOpaque(value, fieldName) {
    if (!OPAQUE_IDENTIFIER.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
    }
}
function assertFieldName(value) {
    if (!FIELD_NAME.test(value)) {
        throw new DomainError('INVALID_VALUE', 'export field names must be safe identifiers.');
    }
}
function assertUniqueFields(fields) {
    if (fields.length === 0) {
        throw new DomainError('INVALID_VALUE', 'export fields must not be empty.');
    }
    const seen = new Set();
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
export function planBusinessDataExport(input) {
    assertUniqueFields(input.allowedFields);
    assertUniqueFields(input.requestedFields);
    for (const field of input.requestedFields) {
        if (!input.allowedFields.includes(field)) {
            throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'the requested export field is not in the approved allowlist.');
        }
    }
    if (!input.proof.authorized || !input.proof.reauthenticated) {
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'export authorization and re-authentication are required.');
    }
    assertOpaque(input.proof.scopeId, 'export.scopeId');
    assertOpaque(input.proof.requestId, 'export.requestId');
    assertOpaque(input.proof.authorizationReference, 'export.authorizationReference');
    assertOpaque(input.proof.reauthenticationReference, 'export.reauthenticationReference');
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
export function planBusinessExportPage(input) {
    if (!Number.isInteger(input.sequence) || input.sequence < 1) {
        throw new DomainError('INVALID_VALUE', 'export page sequence must be positive.');
    }
    if (!Number.isInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > MAX_EXPORT_PAGE_SIZE) {
        throw new DomainError('INVALID_VALUE', 'export page size is out of range.');
    }
    for (const [name, cursor] of [
        ['cursor', input.cursor ?? null],
        ['nextCursor', input.nextCursor ?? null]
    ]) {
        if (cursor !== null)
            assertOpaque(cursor, `export.${name}`);
    }
    if (input.hasMore !==
        (input.nextCursor !== undefined && input.nextCursor !== null)) {
        throw new DomainError('INVALID_VALUE', 'export hasMore must agree with nextCursor.');
    }
    return {
        sequence: input.sequence,
        pageSize: input.pageSize,
        cursor: input.cursor ?? null,
        nextCursor: input.nextCursor ?? null,
        hasMore: input.hasMore
    };
}
function safeCellText(value) {
    if (value === null)
        return '';
    const text = String(value).replace(/\r\n?/g, '\n');
    // Excel and spreadsheet viewers may execute cells beginning with these
    // characters. Prefixing an apostrophe keeps the value visibly intact while
    // making the exported cell a literal. Leading whitespace is covered too.
    return /^[\t ]*[=+\-@]/.test(text) ? `'${text}` : text;
}
function csvCell(value) {
    const text = safeCellText(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/**
 * Renders one UTF-8 CSV page. The UTF-8 BOM helps spreadsheet applications
 * preserve Traditional Chinese text; values are escaped and formula-safe.
 * Only requested headers are read, so unexpected row fields cannot leak.
 */
export function renderBusinessExportCsvPage(input) {
    assertUniqueFields(input.fields);
    const lines = [input.fields.map(csvCell).join(',')];
    for (const row of input.rows) {
        lines.push(input.fields.map((field) => csvCell(row[field] ?? null)).join(','));
    }
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}
