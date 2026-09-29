import { NotFoundException } from '@nestjs/common';
import {
  CreateBusinessExportRequestSchema,
  RevokeBusinessExportRequestSchema,
  type BusinessExportJob
} from '@beauessence/contracts';
import { isRole, taipeiDateRange } from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  ExportDownload,
  FirestoreBusinessExportRepository
} from '../firestore/business-delivery-export.repository.js';
import { evaluateAccess } from '../platform/authorization/rbac.js';
import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import type { FreshReauthenticationVerifier } from './reauthentication.js';
import { actorRefForUid } from './usage-events.js';

export type BusinessExportRepositoryPort = Pick<
  FirestoreBusinessExportRepository,
  'create' | 'get' | 'download' | 'revoke'
>;

const EXPORT_ID = /^exp_[a-f0-9]{40}$/;

function authorizeExport(authentication: AuthenticationContext): void {
  // Strict: a legacy alias must not widen a server session into a new role.
  const role: unknown = authentication.actorRole;
  if (!isRole(role)) throw new AuthorizationDeniedError();
  evaluateAccess(authentication, {
    role,
    accountActive: true,
    permission: 'export_business_data',
    scope: { kind: 'any' }
  });
}

/**
 * CP-04 safe export (BD-POLICY-2026-09-29 §1, OWNER-BATCH-2026-09-29B item 2).
 * Manager only; creating a file needs fresh Google + TOTP re-authentication.
 * The columns and scope are fixed on the server; the client picks dates only.
 * A disabled feature and an unknown or malformed ID both answer 404, so the
 * route cannot be used to probe for exports.
 */
export class BusinessExportApplicationService {
  public constructor(
    private readonly config: BusinessDeliveryConfig,
    private readonly repository: BusinessExportRepositoryPort,
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

  public async create(
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<BusinessExportJob> {
    const config = this.enabledConfig();
    authorizeExport(authentication);
    const request = CreateBusinessExportRequestSchema.parse(body);
    const range = taipeiDateRange({
      from: request.from,
      to: request.to,
      maxDays: config.policy.export.maxRangeDays
    });
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    return this.repository.create({
      idempotencyKey: request.idempotencyKey,
      from: request.from,
      to: request.to,
      startAt: range.startAt,
      endAt: range.endAt,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      policy: config.policy
    });
  }

  public async get(
    exportId: string,
    authentication: AuthenticationContext
  ): Promise<BusinessExportJob> {
    this.enabledConfig();
    authorizeExport(authentication);
    if (!EXPORT_ID.test(exportId)) throw new NotFoundException();
    const job = await this.repository.get(exportId, this.nowUtc());
    if (job === undefined) throw new NotFoundException();
    return job;
  }

  /** Re-checks role, scope and expiry on every call; the ID alone grants nothing. */
  public async download(
    exportId: string,
    authentication: AuthenticationContext
  ): Promise<ExportDownload> {
    this.enabledConfig();
    authorizeExport(authentication);
    if (!EXPORT_ID.test(exportId)) throw new NotFoundException();
    const result = await this.repository.download(
      exportId,
      actorRefForUid(authentication.actorId),
      this.nowUtc()
    );
    if (result === undefined) throw new NotFoundException();
    return result;
  }

  public async revoke(
    exportId: string,
    body: unknown,
    authentication: AuthenticationContext
  ): Promise<BusinessExportJob> {
    this.enabledConfig();
    authorizeExport(authentication);
    if (!EXPORT_ID.test(exportId)) throw new NotFoundException();
    const request = RevokeBusinessExportRequestSchema.parse(body);
    const job = await this.repository.revoke(
      exportId,
      request.idempotencyKey,
      actorRefForUid(authentication.actorId),
      this.nowUtc()
    );
    if (job === undefined) throw new NotFoundException();
    return job;
  }
}
