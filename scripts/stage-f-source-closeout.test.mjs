import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  evaluateExactShaAlignment,
  evaluateImageReference
} from './internal-test-c1-identity.mjs';
import {
  inspectInternalTestImageSource,
  planInternalTestImageBuild
} from './internal-test-image-names.mjs';
import {
  evaluateC1ConfigContract,
  evaluateRequiredCloudConfig,
  redactConfigForLogs
} from './c1-config-contract.mjs';
import { planFirestoreIndexDeploy } from './firestore-index-plan.mjs';
import {
  generateStageFAuthorityPacketStatus,
  inspectStageFSourceGaps,
  planStageFDeploymentGraph,
  renderStageFAuthorityPacketMarkdown
} from './stage-f-deployment-graph.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACKET = {
  sha: HEAD,
  projectId: 'beauessence-clinic-stg-c1a01',
  channel: 'internal-preproduction',
  expires: '7d',
  operator: 'clinic-operator',
  approver: 'clinic-owner',
  sourceSha: HEAD,
  buildSourceSha: HEAD,
  imageSourceSha: HEAD
};

describe('C1 internal-test image naming', () => {
  it('plans SHA-tagged images and refuses latest or staging', () => {
    const plan = planInternalTestImageBuild({
      sourceSha: HEAD,
      projectId: 'beauessence-clinic-stg-c1a01'
    });
    expect(plan.execute).toBe(false);
    expect(plan.apiTag).toContain('/internal-test/api:');
    expect(plan.apiTag).toContain(HEAD);
    expect(plan.workerTag).toContain('/internal-test/worker:');
    expect(plan.buildCommand).not.toContain('latest');
    expect(plan.buildCommand).not.toContain('cal-pilot');
    expect(() =>
      planInternalTestImageBuild({
        sourceSha: HEAD,
        projectId: 'beauessence-clinic-staging'
      })
    ).toThrow(/beauessence-clinic-staging/);
    expect(inspectInternalTestImageSource().ok).toBe(true);
    expect(
      evaluateImageReference(
        'asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api:latest'
      ).ok
    ).toBe(false);
  });
});

describe('exact SHA alignment', () => {
  it('invalidates apply when any of the four SHAs drift', () => {
    expect(
      evaluateExactShaAlignment({
        originMainSha: HEAD,
        authoritySha: HEAD,
        buildSourceSha: HEAD,
        imageSourceSha: HEAD
      }).status
    ).toBe('ALIGNED');
    expect(
      evaluateExactShaAlignment({
        originMainSha: HEAD,
        authoritySha: HEAD,
        buildSourceSha: HEAD,
        imageSourceSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      }).status
    ).toBe('AUTHORITY_INVALIDATED');
  });
});

describe('C1 config contract', () => {
  it('keeps secret values out of git and fails closed when cloud config is missing', () => {
    expect(evaluateC1ConfigContract().ok).toBe(true);
    expect(evaluateRequiredCloudConfig({}, 'api').requiredConfigPresent).toBe(
      false
    );
    expect(
      evaluateRequiredCloudConfig(
        { INTERNAL_TEST_BOOKING_ENABLED: 'false' },
        'api'
      ).missing
    ).not.toContain('INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC');
    expect(
      evaluateRequiredCloudConfig(
        { INTERNAL_TEST_BOOKING_ENABLED: 'true' },
        'api'
      ).missing
    ).toContain('INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC');
    expect(
      evaluateRequiredCloudConfig(
        {
          CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN:
            'beauessence-clinic-stg-c1a01.firebaseapp.com'
        },
        'api'
      ).missing
    ).toContain('CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN_INVALID');
    expect(
      evaluateRequiredCloudConfig(
        {
          CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN:
            'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
        },
        'api'
      ).missing
    ).not.toContain('CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN');
    expect(
      evaluateRequiredCloudConfig(
        {
          CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN:
            'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
        },
        'api'
      ).missing
    ).not.toContain('CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN_INVALID');
    const redacted = redactConfigForLogs({
      GOOGLE_SERVICE_ACCOUNT_JSON: 'super-secret',
      GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01'
    });
    expect(redacted.GOOGLE_SERVICE_ACCOUNT_JSON).toBe('[redacted]');
    expect(redacted.GOOGLE_CLOUD_PROJECT).toBe('beauessence-clinic-stg-c1a01');
    expect(JSON.stringify(redacted)).not.toContain('super-secret');
  });
});

describe('Firestore index plan', () => {
  it('covers every composite query in the matrix without loosening Rules', () => {
    const plan = planFirestoreIndexDeploy();
    expect(plan.execute).toBe(false);
    expect(plan.evaluation.ok).toBe(true);
    expect(plan.rulesRemainDenyAll).toBe(true);
    const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/allow read, write: if false/);
  });
});

describe('Stage F deployment graph', () => {
  it('stays execute:false and waits for post-merge SHA on a feature branch', () => {
    const source = inspectStageFSourceGaps();
    expect(source.issues).toEqual([]);
    expect(source.ok).toBe(true);
    expect(source).toMatchObject({
      e1: 'CLOSED',
      e2: 'CLOSED',
      e3: 'CLOSED',
      e4: 'CLOSED',
      e5: 'CLOSED',
      e6: 'CLOSED',
      e7: 'CLOSED'
    });
    const graph = planStageFDeploymentGraph({
      packet: PACKET,
      headSha: HEAD,
      originMainSha: HEAD,
      inspect: { cloudRunServices: [] }
    });
    expect(graph.execute).toBe(false);
    expect(graph.cloudMutation).toBe('NONE');
    expect(graph.stageFApply).toBe('NOT_STARTED');
    expect(graph.hosting.apiTargetStatus).toBe('API_TARGET_MISSING');
    expect(
      generateStageFAuthorityPacketStatus({
        originMainSha: HEAD,
        headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        sourceReady: true
      })
    ).toMatchObject({
      APPLY_ON_THIS_SHA: 'WAITING_FOR_POST_MERGE_SHA',
      OWNER_DECISION: { APPROVE: false, REJECT: false }
    });
    expect(
      generateStageFAuthorityPacketStatus({
        originMainSha: HEAD,
        headSha: HEAD,
        sourceReady: true
      }).APPLY_ON_THIS_SHA
    ).toBe('READY');
    const waiting = generateStageFAuthorityPacketStatus({
      originMainSha: HEAD,
      headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      sourceReady: true
    });
    const markdown = renderStageFAuthorityPacketMarkdown(waiting, {
      authoritySha: HEAD
    });
    expect(markdown).toContain('WAITING_FOR_POST_MERGE_SHA');
    expect(markdown).toContain('[ ] APPROVE');
    expect(markdown).not.toContain('[x] APPROVE');
    expect(markdown).toContain('PACKET_COMMIT_IS_NOT_AUTHORITY_SHA = true');
  });
});
