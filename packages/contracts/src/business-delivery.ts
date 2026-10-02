import { z } from 'zod';

import {
  IdempotencyKeySchema,
  LocalDateSchema,
  OpaqueIdentifierSchema,
  UtcIsoTimestampSchema
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

/**
 * CP-04 export. The server fixes the columns (the approved allowlist) and the
 * scope; the client only picks the Taipei date range. CSV is the only format
 * this phase (`OWNER-BATCH-2026-09-29B` item 2), so any other value is refused.
 */
export const CreateBusinessExportRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    format: z.literal('csv'),
    /** Inclusive Taipei calendar dates of the appointment start time. */
    from: LocalDateSchema,
    to: LocalDateSchema
  })
  .strict();

export const RevokeBusinessExportRequestSchema = z
  .object({ idempotencyKey: IdempotencyKeySchema })
  .strict();

export const BusinessExportStatusSchema = z.enum([
  'ready',
  'exhausted',
  'expired',
  'revoked',
  'purged'
]);

export const BusinessExportJobSchema = z
  .object({
    exportId: OpaqueIdentifierSchema,
    status: BusinessExportStatusSchema,
    format: z.literal('csv'),
    from: LocalDateSchema,
    to: LocalDateSchema,
    rowCount: z.number().int().min(0),
    byteLength: z.number().int().min(0),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string(),
    downloadExpiresAt: z.string(),
    downloadsRemaining: z.number().int().min(0),
    purgeAt: z.string(),
    replayed: z.boolean().optional()
  })
  .strict();

export type CreateBusinessExportRequest = z.infer<
  typeof CreateBusinessExportRequestSchema
>;
export type BusinessExportJob = z.infer<typeof BusinessExportJobSchema>;

/** CP-07 manager-only termination operations. */
export const CreateBusinessTerminationRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    noticeDate: LocalDateSchema
  })
  .strict();

export const BusinessTerminationChecklistItemSchema = z.enum([
  'backup_disposition',
  'audit_disposition',
  'access_revocation'
]);

export const BusinessTerminationAcknowledgementRequestSchema =
  z.discriminatedUnion('receiptKind', [
    z
      .object({
        idempotencyKey: IdempotencyKeySchema,
        receiptKind: z.literal('data_return'),
        exportId: OpaqueIdentifierSchema
      })
      .strict(),
    z
      .object({
        idempotencyKey: IdempotencyKeySchema,
        receiptKind: BusinessTerminationChecklistItemSchema,
        evidenceRef: OpaqueIdentifierSchema
      })
      .strict()
  ]);

export const CloseBusinessTerminationRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    expectedVersion: z.number().int().min(1)
  })
  .strict();

export const BusinessTerminationStateSchema = z.enum([
  'termination_pending',
  'controlled_retention',
  'manual_close_review'
]);

export const BusinessTerminationMissingStepSchema = z.enum([
  'data_return',
  'controlled_copy_retention',
  'backup_disposition',
  'audit_disposition',
  'access_revocation'
]);
export type BusinessTerminationMissingStep = z.infer<
  typeof BusinessTerminationMissingStepSchema
>;

export const BusinessTerminationReceiptSchema = z.discriminatedUnion(
  'receiptKind',
  [
    z
      .object({
        receiptKind: z.literal('data_return'),
        exportId: OpaqueIdentifierSchema,
        actorRef: z.string().regex(/^[a-f0-9]{64}$/),
        acknowledgedAt: UtcIsoTimestampSchema,
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
      })
      .strict(),
    z
      .object({
        receiptKind: BusinessTerminationChecklistItemSchema,
        evidenceRef: OpaqueIdentifierSchema,
        actorRef: z.string().regex(/^[a-f0-9]{64}$/),
        acknowledgedAt: UtcIsoTimestampSchema
      })
      .strict()
  ]
);

export const BusinessTerminationResponseSchema = z
  .object({
    terminationId: OpaqueIdentifierSchema,
    state: BusinessTerminationStateSchema,
    noticeDate: LocalDateSchema,
    noticeStartedAt: UtcIsoTimestampSchema,
    noticeDueAt: UtcIsoTimestampSchema,
    controlledRetentionUntil: UtcIsoTimestampSchema.nullable(),
    version: z.number().int().min(1),
    receipts: z.array(BusinessTerminationReceiptSchema),
    closeReadiness: z
      .object({
        ready: z.boolean(),
        missingSteps: z.array(BusinessTerminationMissingStepSchema)
      })
      .strict(),
    replayed: z.boolean().optional()
  })
  .strict();

export type CreateBusinessTerminationRequest = z.infer<
  typeof CreateBusinessTerminationRequestSchema
>;
export type BusinessTerminationAcknowledgementRequest = z.infer<
  typeof BusinessTerminationAcknowledgementRequestSchema
>;
export type CloseBusinessTerminationRequest = z.infer<
  typeof CloseBusinessTerminationRequestSchema
>;
export type BusinessTerminationChecklistItem = z.infer<
  typeof BusinessTerminationChecklistItemSchema
>;
export type BusinessTerminationReceipt = z.infer<
  typeof BusinessTerminationReceiptSchema
>;
export type BusinessTerminationResponse = z.infer<
  typeof BusinessTerminationResponseSchema
>;

/** CP-05 retention requests are deliberately limited to opaque patient IDs. */
export const RetentionReasonCodeSchema = z.enum([
  'patient_request',
  'retention_expired',
  'duplicate_record',
  'other'
]);

export const RetentionPatientRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    patientId: OpaqueIdentifierSchema
  })
  .strict();

export const PermanentDeletePatientRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    patientId: OpaqueIdentifierSchema,
    reasonCode: RetentionReasonCodeSchema
  })
  .strict();

export const SetPatientLegalHoldRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    patientId: OpaqueIdentifierSchema,
    hold: z.boolean(),
    reasonCode: RetentionReasonCodeSchema
  })
  .strict();

export const PatientArchivedResponseSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    state: z.literal('archived'),
    restorableUntil: z.string()
  })
  .strict();

export const PatientRestoredResponseSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    state: z.literal('active')
  })
  .strict();

export const PatientRetentionLayersSchema = z
  .object({
    patients: z.number().int().min(0),
    appointments: z.number().int().min(0),
    patient_booking_guards: z.number().int().min(0),
    patient_follow_up_states: z.number().int().min(0),
    return_sessions: z.number().int().min(0),
    follow_ups: z.number().int().min(0),
    patient_lookup_index_v2: z.number().int().min(0)
  })
  .strict();

export const PatientPermanentlyDeletedResponseSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    state: z.literal('deleted'),
    layers: PatientRetentionLayersSchema
  })
  .strict();

export const PatientLegalHoldResponseSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    legalHold: z.boolean()
  })
  .strict();

export const PendingPatientDeletionSchema = z
  .object({
    patientId: OpaqueIdentifierSchema,
    archivedAt: z.string(),
    restorableUntil: z.string(),
    legalHold: z.boolean()
  })
  .strict();

export const PendingPatientDeletionResponseSchema = z
  .object({ patients: z.array(PendingPatientDeletionSchema) })
  .strict();

export type RetentionReasonCode = z.infer<typeof RetentionReasonCodeSchema>;
export type RetentionPatientRequest = z.infer<
  typeof RetentionPatientRequestSchema
>;
export type PermanentDeletePatientRequest = z.infer<
  typeof PermanentDeletePatientRequestSchema
>;
export type SetPatientLegalHoldRequest = z.infer<
  typeof SetPatientLegalHoldRequestSchema
>;
export type PatientArchivedResponse = z.infer<
  typeof PatientArchivedResponseSchema
>;
export type PatientRestoredResponse = z.infer<
  typeof PatientRestoredResponseSchema
>;
export type PatientPermanentlyDeletedResponse = z.infer<
  typeof PatientPermanentlyDeletedResponseSchema
>;
export type PatientLegalHoldResponse = z.infer<
  typeof PatientLegalHoldResponseSchema
>;
export type PendingPatientDeletionResponse = z.infer<
  typeof PendingPatientDeletionResponseSchema
>;
