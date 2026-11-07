import { NotFoundException } from '@nestjs/common';
import {
  RetentionPatientRequestSchema,
  type PatientArchivedResponse
} from '@beauessence/contracts';

import type { FirestoreBusinessRetentionRepository } from '../firestore/business-delivery-retention.repository.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';

/** Only this capability is exposed to a future synthetic retention runner. */
export type AutomaticPatientRetentionPort = Pick<
  FirestoreBusinessRetentionRepository,
  'archiveExpiredPatient'
>;

/**
 * Source-only archive entry: not registered in a module, controller or worker.
 * No scheduler, credentials, human re-authentication or restore/delete grant.
 * Eligibility is authoritative only inside the repository write transaction.
 */
export class AutomaticPatientRetentionService {
  public constructor(
    private readonly config: BusinessDeliveryConfig,
    private readonly repository: AutomaticPatientRetentionPort,
    private readonly nowUtc: () => string
  ) {}

  public async archiveIfExpired(
    body: unknown
  ): Promise<PatientArchivedResponse> {
    if (!this.config.enabled || this.config.scope !== 'internal_synthetic') {
      throw new NotFoundException();
    }
    const request = RetentionPatientRequestSchema.parse(body);
    return this.repository.archiveExpiredPatient({
      ...request,
      now: this.nowUtc(),
      scope: this.config.scope,
      policy: this.config.policy
    });
  }
}
