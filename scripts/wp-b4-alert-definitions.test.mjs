import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WP_B4_IMMEDIATE_ALERTS } from '@beauessence/domain';

import { inspectWpB4AlertDefinitions } from './wp-b4-alert-definitions.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('WP-B4 alert definitions', () => {
  it('matches the signed domain catalog and keeps recipients out of git', () => {
    const result = inspectWpB4AlertDefinitions();
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(WP_B4_IMMEDIATE_ALERTS).toHaveLength(9);
    const terraform = readFileSync(
      join(root, 'infra/terraform/wp-b4-alerting/main.tf'),
      'utf8'
    );
    expect(terraform).toContain(
      'apply_enabled = var.exact_apply_authority_sha != "not_granted"'
    );
    expect(terraform).toContain('c1-application-alerts');
    expect(terraform).toContain('type         = "email"');
    expect(terraform).toContain('wp-b4-outbox-oldest-age');
    expect(terraform).toContain(
      'resource "google_monitoring_alert_policy" "outbox_age"'
    );
    expect(terraform).toContain('threshold_value = 59');
    expect(terraform).toContain('duration        = "60s"');
    expect(terraform).toContain('value_type  = "DISTRIBUTION"');
    expect(terraform).toContain('ALIGN_PERCENTILE_99');
    expect(terraform).toContain('EXTRACT(jsonPayload.oldestPendingAgeSeconds)');
    expect(terraform).toContain('c1-iam-setiampolicy');
    expect(terraform).toContain(
      'resource "google_monitoring_alert_policy" "iam_setiampolicy_application"'
    );
    expect(terraform).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const example = readFileSync(
      join(root, 'infra/terraform/wp-b4-alerting/terraform.tfvars.example'),
      'utf8'
    );
    expect(example).toContain('exact_apply_authority_sha = "not_granted"');
    expect(example).toContain('alert_email_address       = ""');
  });
});
