import type { OutboxJob } from '@beauessence/domain';

/**
 * What the worker may do with a job once it has re-read the patient's latest
 * archive state (stage 3 of the two-year auto-archive).
 *
 * - `remove`: the patient is archived, so the event must not exist. The worker
 *   deletes it (a 404/410 is already success) instead of upserting.
 * - `skip`: the job was queued for an archive episode that is over, or it is a
 *   restore job for a patient who is archived again. Doing nothing is the only
 *   way a delayed job can neither resurrect an event nor delete a fresh one.
 * - `proceed`: the patient is in use; the ordinary projection rules apply.
 */
export type RetentionProjectionDecision = 'proceed' | 'remove' | 'skip';

export interface RetentionProjectionFacts {
  /** The appointment document data, or undefined when it no longer exists. */
  readonly appointment: Readonly<Record<string, unknown>> | undefined;
  /** The owning patient document data, or undefined when it cannot be found. */
  readonly patient: Readonly<Record<string, unknown>> | undefined;
}

export function decideRetentionProjection(
  job: Pick<OutboxJob, 'retentionOperation' | 'retentionArchivedAt'>,
  facts: RetentionProjectionFacts
): RetentionProjectionDecision {
  const { appointment, patient } = facts;
  const storedArchivedAt = patient?.['archivedAt'];
  // The patient document is authoritative; the appointment flag is only the
  // fallback when that document cannot be found.
  const archivedNow =
    patient === undefined
      ? appointment?.['patientArchived'] === true
      : storedArchivedAt !== undefined && storedArchivedAt !== null;

  if (job.retentionOperation === 'archive') {
    // The record is gone, so no event may remain for it.
    if (appointment === undefined) return 'remove';
    if (!archivedNow) return 'skip';
    if (patient !== undefined && storedArchivedAt !== job.retentionArchivedAt)
      return 'skip';
    return 'remove';
  }
  if (job.retentionOperation === 'restore') {
    return appointment === undefined || archivedNow ? 'skip' : 'proceed';
  }
  return archivedNow ? 'remove' : 'proceed';
}
