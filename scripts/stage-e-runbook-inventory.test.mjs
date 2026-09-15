import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('Stage E runbook and evidence commands exist', () => {
  it('registers the inspect/evidence scripts and the files they name', () => {
    for (const name of [
      'inspect:wp-b4-alerts',
      'inspect:historical-artifacts',
      'inspect:stage-f-matrix',
      'evidence:stage-e',
      'render:weekday-summary',
      'inspect:internal-test-backup',
      'inspect:internal-test-monitoring'
    ]) {
      expect(pkg.scripts[name]).toBeTypeOf('string');
    }
    for (const relative of [
      'docs/runbooks/stage-e-operational.md',
      'docs/architecture/stage-e-monitoring.md',
      'docs/architecture/stage-f-deployed-acceptance-matrix.md',
      'infra/monitoring/wp-b4-alert-policies.json',
      'infra/monitoring/notification-path.json',
      'infra/terraform/wp-b4-alerting/main.tf',
      'scripts/stage-e-evidence.mjs',
      'scripts/historical-artifacts.mjs'
    ]) {
      expect(existsSync(join(root, relative))).toBe(true);
    }
    const runbook = readFileSync(
      join(root, 'docs/runbooks/stage-e-operational.md'),
      'utf8'
    );
    for (const heading of [
      '## API outage',
      '## Booking write failure',
      '## Firestore incident',
      '## Calendar sync failure',
      '## Calendar 410 recovery',
      '## Watch channel renewal',
      '## Outbox dead-letter',
      '## Backup restore',
      '## Auth incident',
      '## Rate-limit abuse',
      '## IAM mutation alert',
      '## Rollback',
      '## Isolated preview deployment'
    ]) {
      expect(runbook).toContain(heading);
    }
    expect(runbook).toContain('PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED');
    expect(runbook).toContain('code ready ≠ production activated');
  });
});
