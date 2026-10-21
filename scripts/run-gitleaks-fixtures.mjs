import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runFixtureProof } from './gitleaks-fixtures.mjs';

try {
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).trim();
  const summary = runFixtureProof({
    config: readFileSync(new URL('../gitleaks.toml', import.meta.url), 'utf8'),
    output: fileURLToPath(
      new URL('../output/evidence/gitleaks-fixtures.json', import.meta.url)
    ),
    source
  });
  console.log(
    `Pinned Gitleaks fixtures PASS: ${summary.cases} cases at ${source}.`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
