import { NotFoundException } from '@nestjs/common';
import {
  ROLES,
  resolveApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import type { BusinessExportJob } from '@beauessence/contracts';
import { DomainError } from '@beauessence/domain';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { CreateExportCommand } from '../firestore/business-delivery-export.repository.js';
import { CANDIDATE_ROLE_PERMISSIONS } from '../platform/authorization/rbac.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import { BusinessExportApplicationService } from './business-export.application-service.js';
import { actorRefForUid } from './usage-events.js';

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const ENABLED: BusinessDeliveryConfig = {
  enabled: true,
  policy: POLICY,
  scope: 'internal_synthetic',
  observedSince: '2030-09-01T00:00:00.000Z'
};
const NOW = '2030-10-20T00:00:00.000Z';
const EXPORT_ID = `exp_${'a'.repeat(40)}`;

// Roles come from the single source; the permission table decides who may act.
const exporters = ROLES.filter((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('export_business_data')
);
const OWNER_ROLE = exporters[0]!;

const JOB: BusinessExportJob = {
  exportId: EXPORT_ID,
  status: 'ready',
  format: 'csv',
  from: '2030-10-01',
  to: '2030-10-31',
  rowCount: 0,
  byteLength: 3,
  sha256: 'b'.repeat(64),
  createdAt: NOW,
  downloadExpiresAt: '2030-10-21T00:00:00.000Z',
  downloadsRemaining: 3,
  purgeAt: '2030-10-27T00:00:00.000Z'
};

function staff(actorRole: string): AuthenticationContext {
  return { actorId: 'staff_uid_01', actorRole };
}

function fake() {
  const created: CreateExportCommand[] = [];
  const calls: string[] = [];
  return {
    created,
    calls,
    repository: {
      create(command: CreateExportCommand) {
        created.push(command);
        return Promise.resolve(JOB);
      },
      get(exportId: string) {
        calls.push(`get:${exportId}`);
        return Promise.resolve(exportId === EXPORT_ID ? JOB : undefined);
      },
      download(exportId: string) {
        calls.push(`download:${exportId}`);
        return Promise.resolve(
          exportId === EXPORT_ID ? { job: JOB, content: 'csv' } : undefined
        );
      },
      revoke(exportId: string) {
        calls.push(`revoke:${exportId}`);
        return Promise.resolve(
          exportId === EXPORT_ID
            ? { ...JOB, status: 'revoked' as const }
            : undefined
        );
      }
    }
  };
}

function service(
  repository = fake().repository,
  assertFresh: () => Promise<void> = () => Promise.resolve(),
  config: BusinessDeliveryConfig = ENABLED
) {
  return new BusinessExportApplicationService(
    config,
    repository,
    { assertFresh },
    () => NOW
  );
}

const body = {
  idempotencyKey: 'export-key-00000001',
  format: 'csv',
  from: '2030-10-01',
  to: '2030-10-31'
};

describe('BusinessExportApplicationService permissions', () => {
  it('grants export to exactly one role', () => {
    expect(exporters).toHaveLength(1);
  });

  it.each(ROLES.filter((role) => !exporters.includes(role)))(
    'denies the %s role every export route',
    async (role) => {
      const instance = service();
      await expect(
        instance.create(body, 'fresh', staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(instance.get(EXPORT_ID, staff(role))).rejects.toBeInstanceOf(
        AuthorizationDeniedError
      );
      await expect(
        instance.download(EXPORT_ID, staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(
        instance.revoke(
          EXPORT_ID,
          { idempotencyKey: 'revoke-key-000001' },
          staff(role)
        )
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
  );

  it('answers 404 on every route when the feature is off', async () => {
    const instance = service(fake().repository, undefined, { enabled: false });
    await expect(
      instance.create(body, 'fresh', staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      instance.download(EXPORT_ID, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('create', () => {
  it('passes the Taipei range, server actor and time to the repository', async () => {
    const repo = fake();
    await expect(
      service(repo.repository).create(body, 'fresh', staff(OWNER_ROLE))
    ).resolves.toEqual(JOB);
    expect(repo.created).toEqual([
      {
        idempotencyKey: 'export-key-00000001',
        from: '2030-10-01',
        to: '2030-10-31',
        startAt: '2030-09-30T16:00:00.000Z',
        endAt: '2030-10-31T16:00:00.000Z',
        actorRef: actorRefForUid('staff_uid_01'),
        now: NOW,
        policy: POLICY
      }
    ]);
  });

  it('requires fresh re-authentication before generating anything', async () => {
    const repo = fake();
    await expect(
      service(repo.repository, () =>
        Promise.reject(new AuthenticationRequiredError())
      ).create(body, undefined, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(repo.created).toEqual([]);
  });

  it('refuses xlsx and any client-chosen field list', async () => {
    const instance = service();
    await expect(
      instance.create({ ...body, format: 'xlsx' }, 'fresh', staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      instance.create({ ...body, fields: ['name'] }, 'fresh', staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('refuses an inverted or over-long range before re-authentication', async () => {
    const repo = fake();
    let reauthCalls = 0;
    const instance = service(repo.repository, () => {
      reauthCalls += 1;
      return Promise.resolve();
    });
    await expect(
      instance.create(
        { ...body, from: '2030-11-01', to: '2030-10-01' },
        'fresh',
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      instance.create(
        { ...body, from: '2030-01-01', to: '2031-01-02' },
        'fresh',
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(DomainError);
    expect(reauthCalls).toBe(0);
    expect(repo.created).toEqual([]);
  });
});

describe('get, download and revoke', () => {
  it('answers 404 for a malformed ID without touching storage', async () => {
    const repo = fake();
    const instance = service(repo.repository);
    for (const exportId of ['exp_short', '../exp', `exp_${'A'.repeat(40)}`]) {
      await expect(
        instance.get(exportId, staff(OWNER_ROLE))
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        instance.download(exportId, staff(OWNER_ROLE))
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(repo.calls).toEqual([]);
  });

  it('answers 404 for an unknown export', async () => {
    const instance = service();
    const unknown = `exp_${'c'.repeat(40)}`;
    await expect(
      instance.get(unknown, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      instance.download(unknown, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      instance.revoke(
        unknown,
        { idempotencyKey: 'revoke-key-000001' },
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the file for a known export', async () => {
    await expect(
      service().download(EXPORT_ID, staff(OWNER_ROLE))
    ).resolves.toEqual({ job: JOB, content: 'csv' });
  });

  it('validates the revoke body', async () => {
    await expect(
      service().revoke(EXPORT_ID, {}, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(ZodError);
  });
});
