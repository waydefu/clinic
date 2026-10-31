import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TERRAFORM_MODULES = Object.freeze([
  'c1-foundation',
  'c1-internal-test-run',
  'c2-identity',
  'c5-firestore',
  'c6-calendar',
  'wp-b4-alerting'
]);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testSummaryPattern = /Success!\s+(\d+)\s+passed,\s+(\d+)\s+failed\./g;

function runTerraform(args, label, spawn, write, writeError, cwd) {
  const result = spawn('terraform', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.stdout) write(result.stdout);
  if (result.stderr) writeError(result.stderr);

  if (result.error || result.status !== 0) {
    const reason = result.error
      ? result.error.message
      : `exit status ${result.status}`;
    throw new Error(`${label} failed (${reason}).`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function parseTestSummary(output, module) {
  const summaries = [...output.matchAll(testSummaryPattern)];
  if (summaries.length !== 1) {
    throw new Error(`terraform test for ${module} did not report one summary.`);
  }

  const passed = Number(summaries[0][1]);
  const failed = Number(summaries[0][2]);
  if (failed !== 0) {
    throw new Error(`terraform test for ${module} reported ${failed} failures.`);
  }
  return { passed, failed };
}

export function runTerraformMockTests({
  cwd = root,
  spawn = spawnSync,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text)
} = {}) {
  let passed = 0;

  for (const module of TERRAFORM_MODULES) {
    const directory = `infra/terraform/${module}`;
    runTerraform(
      [
        `-chdir=${directory}`,
        'init',
        '-backend=false',
        '-input=false',
        '-lockfile=readonly'
      ],
      `terraform init for ${module}`,
      spawn,
      write,
      writeError,
      cwd
    );

    const output = runTerraform(
      [`-chdir=${directory}`, 'test', '-no-color'],
      `terraform test for ${module}`,
      spawn,
      write,
      writeError,
      cwd
    );
    passed += parseTestSummary(output, module).passed;
  }

  const result = { modules: TERRAFORM_MODULES.length, passed, failed: 0 };
  write(
    `Terraform mock/noop tests: ${result.passed} passed, 0 failed across ${result.modules} modules.\n`
  );
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runTerraformMockTests();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
