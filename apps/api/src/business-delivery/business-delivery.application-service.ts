import { NotFoundException } from '@nestjs/common';
import {
  MilestoneAcknowledgementRequestSchema,
  MonthlyUsageQuerySchema,
  type BusinessMilestonesResponse,
  type MilestoneAcknowledgementResponse,
  type MonthlyUsageResponse
} from '@beauessence/contracts';
import {
  assessMonthlyUsageCompleteness,
  evaluateBusinessMilestones,
  isRole,
  type Role,
  summarizeMonthlyBusinessUsage,
  taipeiMonthRange
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  FirestoreBusinessDeliveryRepository,
  MilestoneState
} from '../firestore/business-delivery.repository.js';
import { evaluateAccess } from '../platform/authorization/rbac.js';
import { AuthorizationDeniedError } from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import type { FreshReauthenticationVerifier } from './reauthentication.js';
import { actorRefForUid } from './usage-events.js';

export type BusinessDeliveryRepositoryPort = Pick<
  FirestoreBusinessDeliveryRepository,
  'usageEventsBetween' | 'milestoneState' | 'acknowledge'
>;

// Strict: a legacy alias must not widen a server session into a new role.
function staffRole(authentication: AuthenticationContext): Role {
  const role = authentication.actorRole;
  if (!isRole(role)) throw new AuthorizationDeniedError();
  return role;
}

function authorizeRead(authentication: AuthenticationContext): void {
  evaluateAccess(authentication, {
    role: staffRole(authentication),
    accountActive: true,
    permission: 'read_business_delivery',
    scope: { kind: 'any' }
  });
}

function authorizeAcknowledge(authentication: AuthenticationContext): void {
  evaluateAccess(authentication, {
    role: staffRole(authentication),
    accountActive: true,
    permission: 'acknowledge_business_milestone',
    scope: { kind: 'any' }
  });
}

/**
 * CP-03 staff-only report and milestone surface (ADR-0008). A disabled or
 * misconfigured feature answers 404 before authorization, so it reveals
 * nothing and cannot be probed into a fake success.
 */
export class BusinessDeliveryApplicationService {
  public constructor(
    private readonly config: BusinessDeliveryConfig,
    private readonly repository: BusinessDeliveryRepositoryPort,
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

  public async monthlyUsage(
    query: unknown,
    authentication: AuthenticationContext
  ): Promise<MonthlyUsageResponse> {
    const config = this.enabledConfig();
    authorizeRead(authentication);
    const { month } = MonthlyUsageQuerySchema.parse(query);
    const now = this.nowUtc();
    const range = taipeiMonthRange(month);
    const coverage = assessMonthlyUsageCompleteness({
      month,
      observedSince: config.observedSince,
      now,
      lateEventCutoffDays: config.policy.lateEventCutoffDays
    });
    const events = await this.repository.usageEventsBetween(
      range.startAt,
      range.endAt
    );
    const report = summarizeMonthlyBusinessUsage({
      scope: config.scope,
      month,
      events,
      completeness: coverage.completeness
    });
    return {
      policyVersion: config.policy.version,
      scope: config.scope,
      month,
      timeZone: 'Asia/Taipei',
      completeness: report.completeness,
      lockedAt: coverage.lockedAt,
      uniqueStaffUsers: report.uniqueStaffUsers,
      bookingCreatedCount: report.bookingCreatedCount,
      usageClassification: report.usageClassification,
      maintenanceFeeTwd:
        report.usageClassification === 'used'
          ? config.policy.maintenanceFeesTwd.normal
          : report.usageClassification === 'unused'
            ? config.policy.maintenanceFeesTwd.unused
            : null
    };
  }

  public async milestones(
    authentication: AuthenticationContext
  ): Promise<BusinessMilestonesResponse> {
    const config = this.enabledConfig();
    authorizeRead(authentication);
    const state = await this.repository.milestoneState();
    return this.view(config, state);
  }

  public async acknowledge(
    milestoneId: string,
    body: unknown,
    reauthenticationToken: string | undefined,
    authentication: AuthenticationContext
  ): Promise<MilestoneAcknowledgementResponse> {
    const config = this.enabledConfig();
    authorizeAcknowledge(authentication);
    if (milestoneId !== 'formal_launch' && milestoneId !== 'final_payment') {
      throw new NotFoundException();
    }
    const request = MilestoneAcknowledgementRequestSchema.parse(body);
    const now = this.nowUtc();
    await this.reauthentication.assertFresh({
      idToken: reauthenticationToken,
      actorId: authentication.actorId,
      now,
      maxAgeSeconds: config.policy.reauthenticationMaxAgeSeconds
    });
    const result = await this.repository.acknowledge({
      milestoneId: milestoneId,
      idempotencyKey: request.idempotencyKey,
      expectedVersion: request.expectedVersion,
      evidenceRef: request.evidenceRef,
      ...(request.launchDate === undefined
        ? {}
        : { launchDate: request.launchDate }),
      actorRef: actorRefForUid(authentication.actorId),
      now,
      policy: config.policy
    });
    return {
      milestoneId: milestoneId,
      revision: result.revision,
      replayed: result.replayed
    };
  }

  private view(
    config: Extract<BusinessDeliveryConfig, { enabled: true }>,
    state: MilestoneState
  ): BusinessMilestonesResponse {
    const status = evaluateBusinessMilestones({
      policy: config.policy,
      now: this.nowUtc(),
      ...(state.firstEligibleUseAt === undefined
        ? {}
        : { firstEligibleUseAt: state.firstEligibleUseAt }),
      acknowledgements: state.acknowledgements
    });
    return {
      policyVersion: config.policy.version,
      scope: config.scope,
      revision: state.revision,
      ...status
    };
  }
}
