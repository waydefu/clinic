import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { renderWeekdayOperationalSummary } from '@beauessence/domain';

export const WEEKDAY_USAGE =
  'Usage: pnpm render:weekday-summary -- <payload.json>\nRenders a PII-free weekday operational summary. Does not send email.\n';

export function runWeekdaySummaryCli({ argv, stdout, stderr, readFile }) {
  const reader = readFile ?? ((path) => readFileSync(path, 'utf8'));
  const args = argv.filter((item) => item !== '--');
  const [operand] = args;
  if (typeof operand !== 'string' || operand === '') {
    stderr.write(WEEKDAY_USAGE);
    return 2;
  }
  try {
    const input = JSON.parse(reader(operand));
    const summary = renderWeekdayOperationalSummary({
      environment: String(input.environment ?? 'internal_test'),
      generatedAt: String(input.generatedAt ?? new Date().toISOString()),
      rateLimited: Number(input.rateLimited ?? 0),
      authDenials: Number(input.authDenials ?? 0),
      authzDenials: Number(input.authzDenials ?? 0),
      retries: Number(input.retries ?? 0),
      recoveries: Number(input.recoveries ?? 0),
      outboxBacklog: Number(input.outboxBacklog ?? 0),
      calendarCandidateBacklog: Number(input.calendarCandidateBacklog ?? 0),
      apiP95Ms: input.apiP95Ms == null ? null : Number(input.apiP95Ms),
      resourceCostSignal:
        input.resourceCostSignal == null
          ? null
          : String(input.resourceCostSignal)
    });
    const encoded = JSON.stringify(summary, null, 2);
    if (/09\d{8}|[A-Z0-9._%+-]+@/i.test(encoded)) {
      stderr.write('weekday summary would contain a forbidden identifier\n');
      return 2;
    }
    stdout.write(`${encoded}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runWeekdaySummaryCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
}
