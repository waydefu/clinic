import { NotFoundException } from '@nestjs/common';
import {
  PermanentDeletePatientRequestSchema,
  RetentionPatientRequestSchema,
  SetPatientLegalHoldRequestSchema,
  type PatientArchivedResponse,
  type PatientLegalHoldResponse,
  type PatientPermanentlyDeletedResponse,
  type PatientRestoredResponse,
  type PendingPatientDeletionResponse
} from '@beauessence/contracts';
import { isRole } from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { FirestoreBusinessRetentionRepository } from '../firestore/business-delivery-retention.repository.js';
import { evaluateAccess } from '../platform/authorization/rbac.js';
import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import type { FreshReauthenticationVerifier } from './reauthentication.js';
import { actorRefForUid } from './usage-events.js';

export type BusinessRetentionRepositoryPort = Pick<
  FirestoreBusinessRetentionRepository,
  | 'archive'
  | 'restore'
  | 'permanentlyDelete'
  | 'setLegalHold'
  | 'pendingDeletion'
>;

function authorizeRetention(authentication: AuthenticationContext): void {
  const role: unknown = authentication.actorRole;
  if (!isRole(role)) throw new AuthorizationDeniedError();
  evaluateAccess(authentication, {
    role,
    accountActive: true,
    permission: 'manage_business_retention',
    scope: { kind: 'any' }
  });
}

/** CP-05 patient retention, restricted by policy/config and manager RBAC. */
export class BusinessRetentionApplicationService {
  public constructor(
    private readonly config: BusinessDeliveryConfig,
    private readonly repository: BusinessRetentionRepositoryPort,
    private readonly reauthentication: Pick<
      FreshReauthenticationVerifier,
      'assertFresh'
    >,
    private readonly nowUtc: () => string
  ) {}

  private enabledConfig() {
    if (!this.config.enabled) throw new NotFoundException();
    return this.config;
  }

  public async archive(
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<PatientArchivedResponse> {
    const config = this.enabledConfig();
    authorizeRetention(authentication);
    const request = RetentionPatientRequestSchema.parse(body);
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    return this.repository.archive({
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      scope: config.scope,
      policy: config.policy
    });
  }

  public async restore(
    body: unknown,
    authentication: AuthenticationContext
  ): Promise<PatientRestoredResponse> {
    const config = this.enabledConfig();
    authorizeRetention(authentication);
    const request = RetentionPatientRequestSchema.parse(body);
    return this.repository.restore({
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now: this.nowUtc(),
      scope: config.scope,
      policy: config.policy
    });
  }

  public async permanentlyDelete(
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<PatientPermanentlyDeletedResponse> {
    const config = this.enabledConfig();
    authorizeRetention(authentication);
    const request = PermanentDeletePatientRequestSchema.parse(body);
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    return this.repository.permanentlyDelete({
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      scope: config.scope,
      policy: config.policy
    });
  }

  public async setLegalHold(
    body: unknown,
    authentication: AuthenticationContext
  ): Promise<PatientLegalHoldResponse> {
    const config = this.enabledConfig();
    authorizeRetention(authentication);
    const request = SetPatientLegalHoldRequestSchema.parse(body);
    return this.repository.setLegalHold({
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now: this.nowUtc(),
      scope: config.scope,
      policy: config.policy
    });
  }

  public async pendingDeletion(
    authentication: AuthenticationContext
  ): Promise<PendingPatientDeletionResponse> {
    this.enabledConfig();
    authorizeRetention(authentication);
    return this.repository.pendingDeletion(this.nowUtc());
  }
}
