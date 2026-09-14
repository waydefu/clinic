import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ISOLATED_PREVIEW_CONFIG,
  PLAN_USAGE,
  planInternalTestPreviewDeploy,
  runInternalTestPreviewPlanCli
} from './internal-test-preview-plan.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PACKET = {
  sha: HEAD,
  projectId: 'beauessence-clinic-stg-c1a01',
  channel: 'internal-preproduction',
  expires: '7d',
  operator: 'clinic-operator',
  approver: 'clinic-owner'
};

describe('planInternalTestPreviewDeploy', () => {
  it('prints execute:false isolated static Hosting commands', () => {
    const plan = planInternalTestPreviewDeploy(PACKET, HEAD);
    expect(plan.execute).toBe(false);
    expect(plan.config).toBe(ISOLATED_PREVIEW_CONFIG);
    expect(plan.deployCommand).toContain(`--config=${ISOLATED_PREVIEW_CONFIG}`);
    expect(plan.deployCommand).toContain(
      '--project=beauessence-clinic-stg-c1a01'
    );
    expect(plan.deployCommand).not.toMatch(
      /--only\s+live|\bchannel:deploy live\b/
    );
    expect(plan.smokeCommand).toContain(
      'https://beauessence-clinic-stg-c1a01--internal-preproduction.web.app/'
    );
    expect(plan.rollbackCommand).toContain('hosting:channel:delete');
    expect(plan.rollbackCommand).toContain('internal-preproduction');
    expect(plan.rollbackCommand).toContain('--force');
    expect(plan.rollbackCommand).toContain(
      '--project=beauessence-clinic-stg-c1a01'
    );
    expect(plan.rollbackCommand).not.toMatch(/channel:delete live\b/);
    expect(plan.rollbackCommand).not.toContain('beauessence-clinic-staging');
  });

  it('refuses live, staging, and a stale SHA', () => {
    expect(() =>
      planInternalTestPreviewDeploy({ ...PACKET, channel: 'live' }, HEAD)
    ).toThrow(/live Hosting channel/);
    expect(() =>
      planInternalTestPreviewDeploy(
        { ...PACKET, projectId: 'beauessence-clinic-staging' },
        HEAD
      )
    ).toThrow(/beauessence-clinic-staging/);
    expect(() =>
      planInternalTestPreviewDeploy(
        { ...PACKET, sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        HEAD
      )
    ).toThrow(/not this HEAD/);
  });
});

describe('runInternalTestPreviewPlanCli', () => {
  it('exits 2 without deploying when the packet is missing', () => {
    let stderr = '';
    const code = runInternalTestPreviewPlanCli({
      argv: [],
      env: {},
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });
    expect(code).toBe(2);
    expect(stderr).toBe(PLAN_USAGE);
  });

  it('prints execute:false including rollback when pnpm injects --', () => {
    let stdout = '';
    const code = runInternalTestPreviewPlanCli({
      argv: ['--', HEAD],
      env: {
        INTERNAL_TEST_PREVIEW_SHA: HEAD,
        INTERNAL_TEST_PREVIEW_PROJECT: PACKET.projectId,
        INTERNAL_TEST_PREVIEW_CHANNEL: PACKET.channel,
        INTERNAL_TEST_PREVIEW_EXPIRES: PACKET.expires,
        INTERNAL_TEST_PREVIEW_OPERATOR: PACKET.operator,
        INTERNAL_TEST_PREVIEW_APPROVER: PACKET.approver
      },
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} }
    });
    expect(code).toBe(0);
    const plan = JSON.parse(stdout);
    expect(plan.execute).toBe(false);
    expect(plan.rollbackCommand).toContain('hosting:channel:delete');
  });
});

describe('isolated preview Hosting config', () => {
  it('is static-only: no Cloud Run rewrite and no live/staging deploy target', () => {
    const source = readFileSync(join(root, ISOLATED_PREVIEW_CONFIG), 'utf8');
    const config = JSON.parse(source);
    expect(config.firestore).toBeUndefined();
    expect(config.hosting.rewrites.some((rule) => 'run' in rule)).toBe(false);
    expect(source).not.toContain('cal-pilot-api');
    expect(source).not.toContain('hosting:channel:deploy');
    expect(
      readFileSync(join(root, 'scripts/internal-test-preview-plan.mjs'), 'utf8')
    ).not.toMatch(/execFile|spawnSync|firebase deploy/);
  });

  it('keeps static redirects, rewrites, and headers aligned with firebase.json', () => {
    const calPilot = JSON.parse(
      readFileSync(join(root, 'firebase.json'), 'utf8')
    ).hosting;
    const isolated = JSON.parse(
      readFileSync(join(root, ISOLATED_PREVIEW_CONFIG), 'utf8')
    ).hosting;
    expect(isolated.public).toBe(calPilot.public);
    expect(isolated.predeploy).toEqual(calPilot.predeploy);
    expect(isolated.redirects).toEqual(calPilot.redirects);
    expect(isolated.headers).toEqual(calPilot.headers);
    expect(isolated.rewrites).toEqual(
      calPilot.rewrites.filter((rule) => !('run' in rule))
    );
  });
});
