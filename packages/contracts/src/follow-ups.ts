import { z } from 'zod';

import { IdempotencyKeySchema, OpaqueIdentifierSchema } from './common.js';

/**
 * Recording whether a completed visit needs another one.
 *
 * The command is narrower than the synthetic workbench form on purpose. The
 * workbench also collects a free-text note, a certificate count and a
 * case-manager shortcut; none of those are here. Free text has no approved
 * classification (D-001～D-003), the certificate count is a clinical/billing
 * artefact rather than a scheduling one, and assigning a case manager is its
 * own authorised command (D-007) that must not ride along inside another
 * form's payload. They stay inventory-only until their own decisions land.
 *
 * The target time is validated against the published follow-up grid on the
 * server: a reminder must point at a moment a patient could actually book.
 */

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const FollowUpDecisionSchema = z.enum(['required', 'not_required']);

/**
 * Closed set, matching the clinic's follow-up categories. A category is a
 * scheduling fact ("this is a nose follow-up"), not a clinical note, which is
 * why it can be carried while free text cannot.
 */
export const FollowUpCategorySchema = z.enum([
  'nose_follow_up',
  'throat_follow_up',
  'half_year_repair'
]);

export const RecordFollowUpRequestSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema,
    decision: FollowUpDecisionSchema,
    dueDate: LocalDateSchema.optional(),
    dueTime: LocalTimeSchema.optional(),
    categories: z.array(FollowUpCategorySchema).optional()
  })
  .strict()
  // 「不需要回診」卻帶著目標時間，代表呼叫端狀態不一致。在邊界就擋下，
  // 而不是讓伺服器悄悄忽略——被忽略的欄位會讓 UI 與稽核各說各話。
  .refine(
    (value) =>
      value.decision === 'required' ||
      (value.dueDate === undefined && value.dueTime === undefined),
    {
      message: 'A follow-up that is not required must not carry a target time.'
    }
  )
  .refine(
    (value) =>
      value.decision !== 'required' ||
      (value.dueDate !== undefined && value.dueTime !== undefined),
    { message: 'A required follow-up needs both a target date and time.' }
  );

export const RecordFollowUpResponseSchema = z
  .object({
    appointmentId: OpaqueIdentifierSchema,
    decision: FollowUpDecisionSchema,
    // Server-resolved UTC instant, so the client never has to do the Taipei
    // conversion that the reminder depends on.
    dueAt: z.string().nullable()
  })
  .strict();

export type FollowUpDecision = z.infer<typeof FollowUpDecisionSchema>;
export type FollowUpCategory = z.infer<typeof FollowUpCategorySchema>;
export type RecordFollowUpRequest = z.infer<typeof RecordFollowUpRequestSchema>;
export type RecordFollowUpResponse = z.infer<
  typeof RecordFollowUpResponseSchema
>;
