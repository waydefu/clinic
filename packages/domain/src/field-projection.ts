import { isRole, type Role } from './roles.js';

/**
 * Serialization-layer field filter. D-014 and D-015 still pending, so money
 * and clinical fields are omitted for every role — including manager —
 * rather than returned as null (a null still discloses that the field exists).
 *
 * rbac-matrix.md §4.3 / §7: consultant-vs-consultant commission filtering
 * and physician amount visibility stay unimplemented until those questions
 * are answered. This helper only fail-closes the blocked columns.
 */
const MONEY_FIELD_NAMES = new Set([
  'settlementAmount',
  'consultantCommission',
  'paymentAmount',
  'fee',
  'price'
]);

const CLINICAL_FIELD_NAMES = new Set([
  'clinicalNotes',
  'anesthesia',
  'surgeryNotes'
]);

export function projectRecordFields(
  role: Role | undefined,
  record: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  if (role === undefined || !isRole(role)) return {};
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (MONEY_FIELD_NAMES.has(key) || CLINICAL_FIELD_NAMES.has(key)) continue;
    projected[key] = value;
  }
  return projected;
}

export function isBlockedProjectionField(fieldName: string): boolean {
  return (
    MONEY_FIELD_NAMES.has(fieldName) || CLINICAL_FIELD_NAMES.has(fieldName)
  );
}
