import { z } from 'zod';

import {
  IdempotencyKeySchema,
  LocalDateSchema,
  OpaqueIdentifierSchema
} from './common.js';

/**
 * CP-03 business-delivery wire contracts. Responses carry counts and dates
 * only — never individual events, staff identities or patient values. Who
 * confirmed a milestone and when come from the server session and clock; the
 * request carries only the evidence reference (and, for launch, the date).
 */

export const BusinessMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM.');

export const MonthlyUsageQuerySchema = z
  .object({ month: BusinessMonthSchema })
  .strict();

export const BusinessReportScopeSchema = z.enum([
  'internal_synthetic',
  'production'
]);

export const MonthlyUsageResponseSchema = z
  .object({
    policyVersion: z.string().min(1),
    scope: BusinessReportScopeSchema,
    month: BusinessMonthSchema,
    timeZone: z.literal('Asia/Taipei'),
    completeness: z.enum(['complete', 'partial', 'unknown']),
    lockedAt: z.string(),
    uniqueStaffUsers: z.number().int().min(0),
    bookingCreatedCount: z.number().int().min(0),
    usageClassification: z.enum(['used', 'unused', 'insufficient_evidence']),
    /** Display only; `null` means a person must review the month. */
    maintenanceFeeTwd: z.number().int().min(0).nullable()
  })
  .strict();

export const BusinessMilestoneIdSchema = z.enum([
  'formal_launch',
  'final_payment'
]);

export const MilestoneAcknowledgementRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(0),
    evidenceRef: OpaqueIdentifierSchema,
    launchDate: LocalDateSchema.optional()
  })
  .strict();

const DatedStatus = <T extends string>(status: T) =>
  z.object({ status: z.literal(status) }).strict();

export const BusinessMilestonesResponseSchema = z
  .object({
    policyVersion: z.string().min(1),
    scope: BusinessReportScopeSchema,
    revision: z.number().int().min(0),
    trial: z.union([
      DatedStatus('not_started'),
      z
        .object({
          status: z.enum(['in_progress', 'ended']),
          startDate: LocalDateSchema,
          endExclusiveDate: LocalDateSchema
        })
        .strict()
    ]),
    formalLaunch: z.union([
      DatedStatus('awaiting_acknowledgement'),
      z
        .object({
          status: z.literal('acknowledged'),
          launchDate: LocalDateSchema
        })
        .strict()
    ]),
    formalOperation: z.union([
      DatedStatus('not_started'),
      z
        .object({
          status: z.enum(['in_progress', 'reached']),
          checkpointDate: LocalDateSchema
        })
        .strict()
    ]),
    finalPayment: z.union([
      z
        .object({ status: z.enum(['blocked', 'awaiting_acknowledgement']) })
        .strict(),
      z
        .object({
          status: z.literal('acknowledged'),
          acknowledgedDate: LocalDateSchema
        })
        .strict()
    ]),
    maintenance: z.union([
      DatedStatus('not_started'),
      z
        .object({
          status: z.enum(['scheduled', 'active']),
          startDate: LocalDateSchema
        })
        .strict()
    ])
  })
  .strict();

export const MilestoneAcknowledgementResponseSchema = z
  .object({
    milestoneId: BusinessMilestoneIdSchema,
    revision: z.number().int().min(1),
    replayed: z.boolean()
  })
  .strict();

export type MonthlyUsageResponse = z.infer<typeof MonthlyUsageResponseSchema>;
export type MilestoneAcknowledgementRequest = z.infer<
  typeof MilestoneAcknowledgementRequestSchema
>;
export type BusinessMilestonesResponse = z.infer<
  typeof BusinessMilestonesResponseSchema
>;
export type MilestoneAcknowledgementResponse = z.infer<
  typeof MilestoneAcknowledgementResponseSchema
>;
