import { z } from 'zod';

import {
  IdempotencyKeySchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
} from './common.js';

/**
 * Payroll period governance, as closed wire commands. Closing a period locks
 * its snapshot; afterwards only a reasoned adjustment may move the total, and
 * the reason is a closed set rather than free text — it is written into an audit
 * event that outlives the number it explains, exactly like a deletion reason.
 *
 * The wire is unrouted. `planPayrollPeriodClose` and `planPayrollAdjustment` are
 * the domain authority; these schemas only fix the boundary. Roles, the finance
 * rule version and the lock owner stay gated on D-006～D-008.
 */
export const PayrollPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const PayrollAdjustmentReasonSchema = z.enum([
  'correction',
  'late_completion',
  'disputed_credit'
]);

export const ClosePayrollPeriodRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    managerId: OpaqueIdentifierSchema,
    payrollPeriod: PayrollPeriodSchema
  })
  .strict();

export const RecordPayrollAdjustmentRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    managerId: OpaqueIdentifierSchema,
    payrollPeriod: PayrollPeriodSchema,
    // A signed whole number: a positive delta credits, a negative one debits.
    // Zero is rejected because an adjustment that changes nothing has no reason
    // to exist as an audit-bearing action.
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0, 'must be non-zero'),
    reasonCode: PayrollAdjustmentReasonSchema
  })
  .strict();

/**
 * The locked snapshot is written once. It carries no "last adjusted" field on
 * purpose: a mutable field on an immutable record is what let an earlier version
 * of the adjustment planner overwrite the signed-off total. Corrections live in
 * `PayrollAdjustmentSchema` below, and the payable total is the snapshot plus
 * that ledger.
 */
export const PayrollPeriodSnapshotSchema = z
  .object({
    managerId: OpaqueIdentifierSchema,
    payrollPeriod: PayrollPeriodSchema,
    status: z.literal('locked'),
    creditCount: z.number().int().min(0),
    closedAt: UtcIsoTimestampSchema
  })
  .strict();

/** One append-only correction against a locked period. */
export const PayrollAdjustmentSchema = z
  .object({
    periodId: OpaqueIdentifierSchema,
    managerId: OpaqueIdentifierSchema,
    payrollPeriod: PayrollPeriodSchema,
    sequence: z.number().int().min(1),
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0, 'must be non-zero'),
    reasonCode: PayrollAdjustmentReasonSchema,
    recordedAt: UtcIsoTimestampSchema,
    resultingCreditCount: z.number().int().min(0)
  })
  .strict();

export type PayrollAdjustmentReason = z.infer<
  typeof PayrollAdjustmentReasonSchema
>;
export type ClosePayrollPeriodRequest = z.infer<
  typeof ClosePayrollPeriodRequestSchema
>;
export type RecordPayrollAdjustmentRequest = z.infer<
  typeof RecordPayrollAdjustmentRequestSchema
>;
export type PayrollPeriodSnapshot = z.infer<typeof PayrollPeriodSnapshotSchema>;
export type PayrollAdjustment = z.infer<typeof PayrollAdjustmentSchema>;
