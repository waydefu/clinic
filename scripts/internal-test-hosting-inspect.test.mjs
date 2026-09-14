import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  INSPECT_USAGE,
  ISOLATED_PREVIEW_CONFIG,
  assembleInternalTestHostingEvidence,
  evaluateInternalTestHosting,
  internalTestHostingCollectCommands,
  runInternalTestHostingCli
} from './internal-test-hosting-inspect.mjs';

const isolated = 'beauessence-clinic-stg-c1a01';
const NOW = Date.parse('2026-09-14T01:00:00.000Z');

function passingSnapshot(overrides = {}) {
  return {
    projectId: isolated,
    channels: [
      {
        name: `projects/${isolated}/sites/${isolated}/channels/live`,
        url: `https://${isolated}.web.app`
      },
      {
        id: 'internal-preproduction',
        url: `https://${isolated}--internal-preproduction.web.app`,
        expireTime: '2026-09-21T00:00:00.000Z'
      }
    ],
    ...overrides
  };
}

describe('internalTestHostingCollectCommands', () => {
  it('prints read-only C1 channel list and refuses staging', () => {
    const commands = internalTestHostingCollectCommands(isolated);
    expect(commands[0]).toContain(`--project=${isolated}`);
    expect(commands[0]).toContain('hosting:channel:list');
    expect(commands[0]).toContain(`--config=${ISOLATED_PREVIEW_CONFIG}`);
    expect(commands.join('\n')).not.toMatch(
      /channel:deploy|channel:delete|firebase deploy|terraform apply/
    );
    expect(() =>
      internalTestHostingCollectCommands('beauessence-clinic-staging')
    ).toThrow(/beauessence-clinic-staging/);
  });
});

describe('evaluateInternalTestHosting', () => {
  it('passes a future isolated preview channel alongside live', () => {
    const evidence = assembleInternalTestHostingEvidence(
      passingSnapshot(),
      NOW
    );
    expect(evidence.liveChannelCount).toBe(1);
    expect(evidence.previewUrl).toBe(
      `https://${isolated}--internal-preproduction.web.app`
    );
    expect(evaluateInternalTestHosting(evidence)).toEqual({
      ok: true,
      issues: []
    });
  });

  it('fails closed when Hosting is live-only', () => {
    const evidence = assembleInternalTestHostingEvidence(
      passingSnapshot({
        channels: [
          {
            name: 'live',
            url: `https://${isolated}.web.app`
          }
        ]
      }),
      NOW
    );
    const result = evaluateInternalTestHosting(evidence);
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/preview channel/);
    expect(result.issues.join('\n')).toMatch(/Safety Floor 8/);
    expect(result.issues.join('\n')).toMatch(/live-only/);
  });

  it('fails closed when the preview has expired or uses the live URL', () => {
    const expired = evaluateInternalTestHosting(
      assembleInternalTestHostingEvidence(
        passingSnapshot({
          channels: [
            {
              id: 'internal-preproduction',
              url: `https://${isolated}--internal-preproduction.web.app`,
              expireTime: '2026-09-01T00:00:00.000Z'
            }
          ]
        }),
        NOW
      )
    );
    expect(expired.ok).toBe(false);
    const liveShaped = evaluateInternalTestHosting(
      assembleInternalTestHostingEvidence(
        passingSnapshot({
          channels: [
            {
              id: 'internal-preproduction',
              url: `https://${isolated}.web.app`,
              expireTime: '2026-09-21T00:00:00.000Z'
            }
          ]
        }),
        NOW
      )
    );
    expect(liveShaped.ok).toBe(false);
  });

  it('refuses staging project ids', () => {
    const staging = evaluateInternalTestHosting(
      assembleInternalTestHostingEvidence(
        passingSnapshot({ projectId: 'beauessence-clinic-staging' }),
        NOW
      )
    );
    expect(staging.ok).toBe(false);
    expect(staging.issues.join('\n')).toMatch(/beauessence-clinic-staging/);
    expect(staging.issues.join('\n')).not.toMatch(/live-only/);
  });
});

describe('internal-test Hosting inspect source', () => {
  it('does not deploy, delete, or shell out', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        'internal-test-hosting-inspect.mjs'
      ),
      'utf8'
    );
    expect(source).not.toMatch(
      /execFile|spawnSync|channel:deploy|channel:delete|terraform apply/
    );
  });
});

describe('runInternalTestHostingCli', () => {
  it('exits 2 without mutating when inspect is missing', () => {
    let stderr = '';
    const code = runInternalTestHostingCli({
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

  it('inspects a snapshot without calling firebase', () => {
    let stdout = '';
    const code = runInternalTestHostingCli({
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
    const payload = JSON.parse(stdout);
    expect(payload.execute).toBe(false);
    expect(payload.result.ok).toBe(true);
  });
});
