import { NotFoundException } from '@nestjs/common';
import {
  ROLES,
  resolveApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import type {
  BusinessTerminationResponse,
  BusinessTerminationAcknowledgementRequest
} from '@beauessence/contracts';
import { ZodError } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  AcknowledgeTerminationCommand,
  CloseTerminationCommand,
  CreateTerminationCommand
} from '../firestore/business-delivery-termination.repository.js';
import { CANDIDATE_ROLE_PERMISSIONS } from '../platform/authorization/rbac.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  ConflictError
} from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import { BusinessTerminationApplicationService } from './business-termination.application-service.js';

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const NOW = '2030-10-20T04:00:00.000Z';
const ENABLED: BusinessDeliveryConfig = {
  enabled: true,
  policy: POLICY,
  scope: 'internal_synthetic',
  observedSince: '2030-09-01T00:00:00.000Z'
};
const TERMINATION_ID = `term_${'a'.repeat(40)}`;
const EXPORT_ID = `exp_${'b'.repeat(40)}`;
const managers = ROLES.filter((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('manage_business_termination')
);
const MANAGER = managers[0]!;

const TERMINATION: BusinessTerminationResponse = {
  terminationId: TERMINATION_ID,
  state: 'termination_pending',
  noticeDate: '2030-10-20',
  noticeStartedAt: NOW,
  noticeDueAt: '2030-11-19T04:00:00.000Z',
  controlledRetentionUntil: null,
  version: 1,
  receipts: [],
  closeReadiness: {
    ready: false,
    missingSteps: [
      'data_return',
      'controlled_copy_retention',
      'backup_disposition',
      'audit_disposition',
      'access_revocation'
    ]
  }
};

function staff(actorRole: string): AuthenticationContext {
  return { actorId: 'staff_uid_term_1', actorRole };
}

function setup(
  config: BusinessDeliveryConfig = ENABLED,
  assertFresh: () => Promise<void> = () => Promise.resolve(),
  nowUtc: () => string = () => NOW
) {
  const calls: {
    create: CreateTerminationCommand[];
    get: string[];
    acknowledge: AcknowledgeTerminationCommand[];
    close: CloseTerminationCommand[];
  } = { create: [], get: [], acknowledge: [], close: [] };
  const repository = {
    create: vi.fn((command: CreateTerminationCommand) => {
      calls.create.push(command);
      return Promise.resolve(TERMINATION);
    }),
    get: vi.fn((terminationId: string) => {
      calls.get.push(terminationId);
      return Promise.resolve(
        terminationId === TERMINATION_ID ? TERMINATION : undefined
      );
    }),
    acknowledge: vi.fn((command: AcknowledgeTerminationCommand) => {
      calls.acknowledge.push(command);
      return Promise.resolve(TERMINATION);
    }),
    close: vi.fn((command: CloseTerminationCommand) => {
      calls.close.push(command);
      return Promise.resolve(TERMINATION);
    })
  };
  const assertFreshMock = vi.fn(assertFresh);
  const service = new BusinessTerminationApplicationService(
    config,
    repository,
    { assertFresh: assertFreshMock },
    nowUtc
  );
  return { service, repository, calls, assertFresh: assertFreshMock };
}

const createBody = {
  idempotencyKey: 'termination-key-0001',
  noticeDate: '2030-10-20'
};
const dataReturnBody: BusinessTerminationAcknowledgementRequest = {
  idempotencyKey: 'termination-key-0002',
  receiptKind: 'data_return',
  exportId: EXPORT_ID
};
const checklistBody: BusinessTerminationAcknowledgementRequest = {
  idempotencyKey: 'termination-key-0003',
  receiptKind: 'access_revocation',
  evidenceRef: 'evidence_revocation_1'
};
const closeBody = {
  idempotencyKey: 'termination-key-0004',
  expectedVersion: 2
};

describe('BusinessTerminationApplicationService permissions and reauthentication', () => {
  it('grants termination operations to the manager role only', async () => {
    expect(managers).toHaveLength(1);
    const { service, repository } = setup();
    for (const role of ROLES.filter((candidate) => candidate !== MANAGER)) {
      await expect(
        service.create(createBody, 'fresh', staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.get(TERMINATION_ID, staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.acknowledge(
          TERMINATION_ID,
          dataReturnBody,
          'fresh',
          staff(role)
        )
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        service.close(TERMINATION_ID, closeBody, 'fresh', staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.acknowledge).not.toHaveBeenCalled();
    expect(repository.close).not.toHaveBeenCalled();
  });

  it('turns off all operations before authorization or storage access', async () => {
    const { service, repository, assertFresh } = setup({ enabled: false });
    await expect(
      service.create(createBody, 'fresh', staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.get(TERMINATION_ID, staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.acknowledge(
        TERMINATION_ID,
        dataReturnBody,
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.close(TERMINATION_ID, closeBody, 'fresh', staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(assertFresh).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.acknowledge).not.toHaveBeenCalled();
    expect(repository.close).not.toHaveBeenCalled();
  });

  it('requires fresh reauthentication for every write and no reauth for GET', async () => {
    const denied = setup(ENABLED, () =>
      Promise.reject(new AuthenticationRequiredError())
    );
    await expect(
      denied.service.create(createBody, undefined, staff(MANAGER))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      denied.service.acknowledge(
        TERMINATION_ID,
        dataReturnBody,
        undefined,
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    await expect(
      denied.service.close(TERMINATION_ID, closeBody, undefined, staff(MANAGER))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(denied.repository.create).not.toHaveBeenCalled();
    expect(denied.repository.acknowledge).not.toHaveBeenCalled();
    expect(denied.repository.close).not.toHaveBeenCalled();

    const allowed = setup();
    await allowed.service.create(createBody, 'fresh-token', staff(MANAGER));
    await allowed.service.acknowledge(
      TERMINATION_ID,
      dataReturnBody,
      'fresh-token',
      staff(MANAGER)
    );
    await allowed.service.close(
      TERMINATION_ID,
      closeBody,
      'fresh-token',
      staff(MANAGER)
    );
    await allowed.service.get(TERMINATION_ID, staff(MANAGER));
    expect(allowed.assertFresh).toHaveBeenCalledTimes(3);
    expect(allowed.assertFresh).toHaveBeenNthCalledWith(1, {
      idToken: 'fresh-token',
      actorId: 'staff_uid_term_1',
      now: NOW,
      maxAgeSeconds: 600
    });
    expect(allowed.calls.create[0]).toMatchObject({
      noticeDate: createBody.noticeDate,
      now: NOW,
      policy: POLICY,
      actorRef: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(allowed.calls.acknowledge[0]).toMatchObject({
      request: dataReturnBody,
      now: NOW,
      actorRef: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });
});

describe('BusinessTerminationApplicationService validation', () => {
  it('passes same-body prior-day retries to the repository after Taipei midnight', async () => {
    const nextTaipeiDay = '2030-10-20T16:00:00.000Z';
    const { service, repository, calls, assertFresh } = setup(
      ENABLED,
      () => Promise.resolve(),
      () => nextTaipeiDay
    );

    await service.create(createBody, 'fresh', staff(MANAGER));

    expect(assertFresh).toHaveBeenCalledOnce();
    expect(calls.create[0]).toMatchObject({
      noticeDate: createBody.noticeDate,
      now: nextTaipeiDay,
      scope: 'internal_synthetic',
      policy: POLICY
    });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('rejects malformed or guessed data-return metadata', async () => {
    const { service, repository } = setup();
    await expect(
      service.acknowledge(
        TERMINATION_ID,
        { ...dataReturnBody, sha256: 'a'.repeat(64) },
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      service.acknowledge(
        TERMINATION_ID,
        { ...dataReturnBody, exportId: 'guessed_export' },
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repository.acknowledge).not.toHaveBeenCalled();
  });

  it('accepts opaque human evidence without accepting actor, time or completion claims', async () => {
    const { service, calls } = setup();
    await service.acknowledge(
      TERMINATION_ID,
      checklistBody,
      'fresh',
      staff(MANAGER)
    );
    expect(calls.acknowledge[0]?.request).toEqual(checklistBody);
    await expect(
      service.acknowledge(
        TERMINATION_ID,
        { ...checklistBody, actorRef: 'b'.repeat(64) },
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      service.close(
        TERMINATION_ID,
        { ...closeBody, complete: true },
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('returns 404 for unknown termination IDs and validates expected versions', async () => {
    const { service, repository } = setup();
    await expect(
      service.get('not-a-termination-id', staff(MANAGER))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.close(
        TERMINATION_ID,
        { ...closeBody, expectedVersion: -1 },
        'fresh',
        staff(MANAGER)
      )
    ).rejects.toBeInstanceOf(ZodError);
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.close).not.toHaveBeenCalled();
  });
});
