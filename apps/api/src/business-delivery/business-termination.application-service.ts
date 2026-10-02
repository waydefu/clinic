import { NotFoundException } from '@nestjs/common';
import {
  BusinessTerminationAcknowledgementRequestSchema,
  CloseBusinessTerminationRequestSchema,
  CreateBusinessTerminationRequestSchema,
  type BusinessTerminationResponse
} from '@beauessence/contracts';
import { isRole } from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  AcknowledgeTerminationCommand,
  CloseTerminationCommand,
  CreateTerminationCommand,
  FirestoreBusinessTerminationRepository
} from '../firestore/business-delivery-termination.repository.js';
import { evaluateAccess } from '../platform/authorization/rbac.js';
import {
  AuthorizationDeniedError,
  ConflictError
} from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import type { FreshReauthenticationVerifier } from './reauthentication.js';
import { actorRefForUid } from './usage-events.js';

export type BusinessTerminationRepositoryPort = Pick<
  FirestoreBusinessTerminationRepository,
  'create' | 'get' | 'acknowledge' | 'close'
>;

const TERMINATION_ID = /^term_[a-f0-9]{40}$/;
const EXPORT_ID = /^exp_[a-f0-9]{40}$/;

function authorizeTermination(authentication: AuthenticationContext): void {
  const role: unknown = authentication.actorRole;
  if (!isRole(role)) throw new AuthorizationDeniedError();
  evaluateAccess(authentication, {
    role,
    accountActive: true,
    permission: 'manage_business_termination',
    scope: { kind: 'any' }
  });
}

/** CP-07 manager-only termination evidence; no service or account executor. */
export class BusinessTerminationApplicationService {
  public constructor(
    private readonly config: BusinessDeliveryConfig,
    private readonly repository: BusinessTerminationRepositoryPort,
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
  ): Promise<BusinessTerminationResponse> {
    const config = this.enabledConfig();
    authorizeTermination(authentication);
    const request = CreateBusinessTerminationRequestSchema.parse(body);
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    const command: CreateTerminationCommand = {
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      scope: config.scope,
      policy: config.policy
    };
    return this.repository.create(command);
  }

  public async get(
    terminationId: string,
    authentication: AuthenticationContext
  ): Promise<BusinessTerminationResponse> {
    const config = this.enabledConfig();
    authorizeTermination(authentication);
    if (!TERMINATION_ID.test(terminationId)) throw new NotFoundException();
    const response = await this.repository.get(
      terminationId,
      this.nowUtc(),
      config.scope
    );
    if (response === undefined) throw new NotFoundException();
    return response;
  }

  public async acknowledge(
    terminationId: string,
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<BusinessTerminationResponse> {
    const config = this.enabledConfig();
    authorizeTermination(authentication);
    if (!TERMINATION_ID.test(terminationId)) throw new NotFoundException();
    const request = BusinessTerminationAcknowledgementRequestSchema.parse(body);
    if (
      request.receiptKind === 'data_return' &&
      !EXPORT_ID.test(request.exportId)
    ) {
      throw new ConflictError();
    }
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    const command: AcknowledgeTerminationCommand = {
      terminationId,
      request,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      scope: config.scope,
      policy: config.policy
    };
    return this.repository.acknowledge(command);
  }

  public async close(
    terminationId: string,
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<BusinessTerminationResponse> {
    const config = this.enabledConfig();
    authorizeTermination(authentication);
    if (!TERMINATION_ID.test(terminationId)) throw new NotFoundException();
    const request = CloseBusinessTerminationRequestSchema.parse(body);
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    const command: CloseTerminationCommand = {
      terminationId,
      ...request,
      actorRef: actorRefForUid(authentication.actorId),
      now,
      scope: config.scope,
      policy: config.policy
    };
    return this.repository.close(command);
  }
}
