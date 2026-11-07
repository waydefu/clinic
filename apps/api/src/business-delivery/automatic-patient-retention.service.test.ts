import { NotFoundException } from '@nestjs/common';
import { resolveApprovedBusinessDeliveryPolicy } from '@beauessence/domain';
import { ZodError } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { ConflictError } from '../platform/errors/api-error.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import { AutomaticPatientRetentionService } from './automatic-patient-retention.service.js';

const NOW = '2030-01-01T00:00:00.000Z';
const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const ENABLED: BusinessDeliveryConfig = {
  enabled: true,
  scope: 'internal_synthetic',
  policy: POLICY,
  observedSince: '2029-01-01T00:00:00.000Z'
};
const REQUEST = {
  patientId: 'patient_retention_synthetic',
  idempotencyKey: 'auto-archive-synthetic-0001'
};

function setup(config: BusinessDeliveryConfig = ENABLED) {
  const archiveExpiredPatient = vi.fn().mockResolvedValue({
    patientId: REQUEST.patientId,
    state: 'archived',
    restorableUntil: '2030-01-31T00:00:00.000Z'
  });
  const service = new AutomaticPatientRetentionService(
    config,
    { archiveExpiredPatient },
    () => NOW
  );
  return { service, archiveExpiredPatient };
}

describe('source-only automatic patient retention capability', () => {
  it('delegates only the bounded archive command without a fake human proof', async () => {
    const { service, archiveExpiredPatient } = setup();
    await expect(service.archiveIfExpired(REQUEST)).resolves.toMatchObject({
      state: 'archived'
    });
    expect(archiveExpiredPatient).toHaveBeenCalledExactlyOnceWith({
      ...REQUEST,
      now: NOW,
      scope: ENABLED.enabled && ENABLED.scope,
      policy: POLICY
    });
    expect(service).not.toHaveProperty('restore');
    expect(service).not.toHaveProperty('permanentlyDelete');
    expect(service).not.toHaveProperty('setLegalHold');
    // Identity confirmation is manager-only; the system actor never gets it.
    expect(service).not.toHaveProperty('confirmArchivedIdentity');
    expect(service).not.toHaveProperty('identityCandidates');
  });

  it.each<BusinessDeliveryConfig>([
    { enabled: false },
    { ...ENABLED, scope: 'production' }
  ])('fails closed outside the enabled synthetic scope', async (config) => {
    const { service, archiveExpiredPatient } = setup(config);
    await expect(service.archiveIfExpired(REQUEST)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(archiveExpiredPatient).not.toHaveBeenCalled();
  });

  it.each([
    { operation: 'restore' },
    { operation: 'permanent_delete' },
    { actorRef: 'synthetic_untrusted_actor' },
    { proof: { authorized: true, reauthenticated: true } },
    { scope: 'production' },
    { patientId: '' }
  ])(
    'rejects caller-selected authority, operation, scope or invalid identity: %j',
    async (extra) => {
      const { service, archiveExpiredPatient } = setup();
      await expect(
        service.archiveIfExpired({ ...REQUEST, ...extra })
      ).rejects.toBeInstanceOf(ZodError);
      expect(archiveExpiredPatient).not.toHaveBeenCalled();
    }
  );

  it('propagates a transaction-time denial rather than assuming eligibility', async () => {
    const { service, archiveExpiredPatient } = setup();
    archiveExpiredPatient.mockRejectedValue(new ConflictError());
    await expect(service.archiveIfExpired(REQUEST)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(archiveExpiredPatient).toHaveBeenCalledOnce();
  });
});
