import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  alertAckDecision,
  type ConsumeOutcome
} from './alert-notification-consumer.js';

const terraform = readFileSync(
  new URL('../../../infra/terraform/wp-b4-alerting/main.tf', import.meta.url),
  'utf8'
);

describe('application alert delivery pairing (source and fakes only)', () => {
  it.each<ConsumeOutcome>(['sent', 'duplicate'])(
    'acks %s without needing quarantine',
    (outcome) => {
      expect(alertAckDecision(outcome)).toBe('ack');
    }
  );

  it('never acknowledges a retry, even with a quarantine flag', () => {
    expect(alertAckDecision('retry')).toBe('nack');
    expect(alertAckDecision('retry', true)).toBe('nack');
  });

  it.each<ConsumeOutcome>(['dead_letter', 'rejected_malformed'])(
    'requires durable quarantine before acknowledging %s',
    (outcome) => {
      expect(alertAckDecision(outcome)).toBe('nack');
      expect(alertAckDecision(outcome, false)).toBe('nack');
      expect(alertAckDecision(outcome, true)).toBe('ack');
    }
  );

  it('pairs the source-only worker consumer with pull delivery, never a push endpoint', () => {
    expect(terraform).toContain(
      'apps/worker/src/alert-notification-consumer.ts#consumeAlertMessage'
    );
    expect(terraform).toContain('c1-application-alerts-worker');
    expect(terraform).toContain('c1-application-alerts-dlq-review');
    expect(terraform).not.toMatch(/push_config|push_endpoint/);
    expect(terraform).not.toMatch(
      /google_project_iam_|allUsers|allAuthenticatedUsers/
    );
    expect(terraform).toContain('runtime_verified = false');
    expect(terraform).not.toContain('"HUMAN_NOTIFICATION_PROVEN"');
  });
});
