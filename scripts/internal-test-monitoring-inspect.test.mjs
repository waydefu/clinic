import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  IAM_SETIAMPOLICY_METRIC,
  INSPECT_USAGE,
  assembleInternalTestMonitoringEvidence,
  evaluateInternalTestMonitoring,
  internalTestMonitoringCollectCommands,
  runInternalTestMonitoringCli
} from './internal-test-monitoring-inspect.mjs';

const isolated = 'beauessence-clinic-stg-c1a01';

function passingSnapshot(overrides = {}) {
  return {
    projectId: isolated,
    loggingMetrics: [{ name: IAM_SETIAMPOLICY_METRIC }],
    alertPolicies: [
      {
        displayName: 'C1 IAM SetIamPolicy',
        conditions: [
          {
            conditionThreshold: {
              filter: `metric.type="logging.googleapis.com/user/${IAM_SETIAMPOLICY_METRIC}" AND resource.type="global"`
            }
          }
        ]
      }
    ],
    ...overrides
  };
}

describe('internalTestMonitoringCollectCommands', () => {
  it('prints read-only C1 commands and refuses staging', () => {
    const commands = internalTestMonitoringCollectCommands(isolated);
    expect(commands[0]).toContain(`--project=${isolated}`);
    expect(commands[1]).toContain('monitoring policies list');
    expect(commands.join('\n')).not.toMatch(
      /terraform apply|firebase deploy|policies delete|channels create/
    );
    expect(() =>
      internalTestMonitoringCollectCommands('beauessence-clinic-staging')
    ).toThrow(/beauessence-clinic-staging/);
  });
});

describe('evaluateInternalTestMonitoring', () => {
  it('passes when the IAM metric and SHA-gated alert exist', () => {
    const evidence = assembleInternalTestMonitoringEvidence(passingSnapshot());
    expect(evaluateInternalTestMonitoring(evidence)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('fails closed when the alert policy is missing', () => {
    const evidence = assembleInternalTestMonitoringEvidence(
      passingSnapshot({ alertPolicies: [] })
    );
    const result = evaluateInternalTestMonitoring(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/alert policy/);
    expect(result.issues.join('\n')).toMatch(/exact-SHA packet/);
  });

  it('refuses staging project ids', () => {
    const staging = evaluateInternalTestMonitoring(
      assembleInternalTestMonitoringEvidence(
        passingSnapshot({ projectId: 'beauessence-clinic-staging' })
      )
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/beauessence-clinic-staging/);
  });
});

describe('internal-test monitoring inspect source', () => {
  it('does not apply or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-test-monitoring-inspect.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(
      /execFile|spawnSync|terraform apply|firebase deploy/
    );
  });
});

describe('runInternalTestMonitoringCli', () => {
  it('exits 2 without mutating when inspect is missing', () => {
    let stderr = '';
    const code = runInternalTestMonitoringCli({
      argv: [],
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });
    expect(code).toBe(2);
    expect(stderr).toBe(INSPECT_USAGE);
  });

  it('inspects a snapshot without calling gcloud', () => {
    let stdout = '';
    const code = runInternalTestMonitoringCli({
      argv: ['--', 'inspect', 'snapshot.json'],
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} },
      readFile: () => JSON.stringify(passingSnapshot())
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout).execute).toBe(false);
    expect(JSON.parse(stdout).result.ok).toBe(true);
  });
});
