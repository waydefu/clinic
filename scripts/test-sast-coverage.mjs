import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const entrypointPaths = [
  'apps/web/public/admin-bootstrap.js',
  'apps/web/public/patient-app.js',
  'apps/web/src/calendar-pilot-entry.js'
];
const ruleSuffix = 'clinic.javascript.html-sink-outside-trusted-entrypoint';
const expectedImage =
  'semgrep/semgrep:1.171.0@sha256:bdf7013b2c3634a487671158da77c554f531742326b543a9464d2adf6c433ac8';

export function validateCoverageResult(result, expectedPaths) {
  assert.ifError(result.error);
  assert.equal(result.status, expectedPaths.length === 0 ? 0 : 1);
  const report = JSON.parse(result.stdout);
  assert.ok(Array.isArray(report.errors));
  assert.equal(report.errors.length, 0, 'Scanner errors cannot prove coverage');
  assert.ok(Array.isArray(report.paths?.scanned));
  assert.deepEqual(
    [...report.paths.scanned].sort(),
    [...entrypointPaths].sort()
  );
  assert.ok(Array.isArray(report.results));
  assert.equal(report.results.length, expectedPaths.length);
  assert.deepEqual(
    report.results.map((finding) => finding.path).sort(),
    [...expectedPaths].sort()
  );
  for (const finding of report.results)
    assert.ok(finding.check_id.endsWith(ruleSuffix));
}

export async function runCoverageProof({
  root = fileURLToPath(new URL('../', import.meta.url)),
  image = process.env.SEMGREP_IMAGE
} = {}) {
  assert.equal(image, expectedImage, 'Use the existing pinned scanner image');
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'sast-entrypoint-'));
  const scan = (config) =>
    spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--user',
        `${process.getuid()}:${process.getgid()}`,
        '--env',
        'HOME=/tmp',
        '--env',
        'LANG=C.UTF-8',
        '--volume',
        `${root}:/rules:ro`,
        '--volume',
        `${fixtureRoot}:/src:ro`,
        '--workdir',
        '/src',
        image,
        'semgrep',
        'scan',
        '--oss-only',
        '--metrics',
        'off',
        '--disable-version-check',
        '--strict',
        '--error',
        '--json',
        '--config',
        config,
        '.'
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
  const config = '/rules/security/semgrep/clinic-javascript.yml';
  try {
    for (const path of entrypointPaths) {
      await mkdir(dirname(join(fixtureRoot, path)), { recursive: true });
      await writeFile(
        join(fixtureRoot, path),
        "import { assertRenderable } from './trusted-html.js';\n" +
          "element.innerHTML = assertRenderable('<p>synthetic</p>');\n" +
          "element.innerHTML = '';\n"
      );
    }
    validateCoverageResult(scan(config), []);
    for (const path of entrypointPaths) {
      await writeFile(
        join(fixtureRoot, path),
        "import { assertRenderable } from './trusted-html.js';\n" +
          "element.innerHTML = assertRenderable('<p>synthetic</p>');\n" +
          'element.innerHTML = untrustedInput;\n'
      );
    }
    validateCoverageResult(scan(config), entrypointPaths);
    const missing = scan(
      '/rules/security/semgrep/missing-coverage-fixture.yml'
    );
    assert.ifError(missing.error);
    assert.ok(Number.isInteger(missing.status) && missing.status >= 2);
    const missingReport = JSON.parse(missing.stdout);
    assert.ok(
      Array.isArray(missingReport.errors) && missingReport.errors.length > 0
    );
    assert.match(
      JSON.stringify(missingReport.errors),
      /missing-coverage-fixture\.yml/u
    );
    console.log(
      JSON.stringify({
        safeEntrypoints: entrypointPaths.length,
        rejectedEntrypoints: entrypointPaths.length,
        missingConfigExitCode: missing.status,
        image,
        network: 'none'
      })
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await runCoverageProof();
}
