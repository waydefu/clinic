import { describe, expect, it } from 'vitest';

import {
  WEEKDAY_USAGE,
  runWeekdaySummaryCli
} from './weekday-operational-summary.mjs';

describe('weekday operational summary renderer', () => {
  it('renders a synthetic payload and does not send email', () => {
    let stdout = '';
    const code = runWeekdaySummaryCli({
      argv: ['summary.json'],
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: { write() {} },
      readFile: () =>
        JSON.stringify({
          environment: 'internal_test',
          generatedAt: '2026-09-15T00:00:00.000Z',
          rateLimited: 1,
          authDenials: 2,
          authzDenials: 0,
          retries: 3,
          recoveries: 1,
          outboxBacklog: 0,
          calendarCandidateBacklog: 4,
          apiP95Ms: 90,
          resourceCostSignal: 'budget_pubsub_only'
        })
    });
    expect(code).toBe(0);
    const payload = JSON.parse(stdout);
    expect(payload.synthetic).toBe(true);
    expect(payload.kind).toBe('weekday_operational_summary');
    expect(stdout).not.toMatch(/mailto:|sendMail|nodemailer/);
  });

  it('prints usage without a payload path', () => {
    let stderr = '';
    const code = runWeekdaySummaryCli({
      argv: [],
      stdout: { write() {} },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    });
    expect(code).toBe(2);
    expect(stderr).toBe(WEEKDAY_USAGE);
  });
});
