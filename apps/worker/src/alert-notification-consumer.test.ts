import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALERT_POLICY_ALLOWLIST,
  AlertSendError,
  consumeAlertMessage,
  projectAlert,
  type AlertDedupePort,
  type AlertNotice,
  type AlertSenderPort
} from './alert-notification-consumer.js';

const payload = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: '1.2',
    incident: {
      incident_id: 'inc-1',
      policy_name: 'WP-B4 backup failure',
      state: 'open',
      summary: 'patient Wang 0912-345-678 failed',
      resource_name: 'svc-with-label',
      documentation: { content: 'free text' },
      ...over
    }
  });

function fakes(failWith?: Error) {
  const sent: AlertNotice[] = [];
  const seen = new Set<string>();
  const sender: AlertSenderPort = {
    send: (notice) => {
      if (failWith) return Promise.reject(failWith);
      sent.push(notice);
      return Promise.resolve();
    }
  };
  const dedupe: AlertDedupePort = {
    claim: (key) => Promise.resolve(!seen.has(key) && !!seen.add(key)),
    release: (key) => Promise.resolve(void seen.delete(key))
  };
  return { sent, sender, dedupe };
}

describe('alert notification consumer (fakes only)', () => {
  it('projects only allowlisted fields and drops free text', () => {
    const notice = projectAlert(payload());
    expect(notice).toEqual({
      incidentId: 'inc-1',
      state: 'open',
      policy: 'WP-B4 backup failure'
    });
    expect(JSON.stringify(notice)).not.toMatch(
      /Wang|0912|svc-with-label|free text/
    );
  });

  it('rejects unknown policy, bad state, bad id and non-JSON', () => {
    for (const raw of [
      payload({ policy_name: 'other' }),
      payload({ state: 'weird' }),
      payload({ incident_id: 'a b' }),
      'not json',
      '{}'
    ]) {
      expect(projectAlert(raw)).toBeNull();
    }
  });

  it('sends once and treats redelivery as duplicate', async () => {
    const f = fakes();
    expect(await consumeAlertMessage(payload(), f.sender, f.dedupe)).toBe(
      'sent'
    );
    expect(await consumeAlertMessage(payload(), f.sender, f.dedupe)).toBe(
      'duplicate'
    );
    expect(f.sent).toHaveLength(1);
  });

  it('open and closed of one incident are distinct sends', async () => {
    const f = fakes();
    await consumeAlertMessage(payload(), f.sender, f.dedupe);
    expect(
      await consumeAlertMessage(
        payload({ state: 'closed' }),
        f.sender,
        f.dedupe
      )
    ).toBe('sent');
    expect(f.sent).toHaveLength(2);
  });

  it('retryable failure releases the key so redelivery can succeed', async () => {
    const failing = fakes(new AlertSendError(true));
    expect(
      await consumeAlertMessage(payload(), failing.sender, failing.dedupe)
    ).toBe('retry');
    const working = fakes();
    expect(
      await consumeAlertMessage(payload(), working.sender, failing.dedupe)
    ).toBe('sent');
    expect(working.sent).toHaveLength(1);
  });

  it('non-retryable failure and malformed input never loop or send', async () => {
    const f = fakes(new AlertSendError(false));
    expect(await consumeAlertMessage(payload(), f.sender, f.dedupe)).toBe(
      'dead_letter'
    );
    expect(await consumeAlertMessage('nope', f.sender, f.dedupe)).toBe(
      'rejected_malformed'
    );
    expect(f.sent).toHaveLength(0);
  });

  it('keeps the policy allowlist equal to the Terraform policy names', () => {
    const tf = readFileSync(
      new URL(
        '../../../infra/terraform/wp-b4-alerting/main.tf',
        import.meta.url
      ),
      'utf8'
    );
    const names = [...tf.matchAll(/display_name = "(WP-B4 [^"]+)"/g)]
      .map((m) => m[1] as string)
      .filter((n) => !/Pub\/Sub|human email| threshold$/.test(n));
    expect([...ALERT_POLICY_ALLOWLIST].sort()).toEqual(
      [...new Set(names)].sort()
    );
  });
});
