import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const outputDirectory =
  process.env.PREVIEW_EVIDENCE_OUTPUT_DIR ?? 'output/evidence';
const previewInput =
  process.env.PREVIEW_URL ??
  process.argv.find((argument) => argument.startsWith('https://'));

if (!previewInput) {
  console.error(
    'Usage: pnpm verify:preview -- https://beauessence-clinic-staging--synthetic-review-….web.app'
  );
  process.exit(2);
}

const baseUrl = new URL(previewInput);
const allowedHost =
  /^beauessence-clinic-staging--synthetic-review-[a-z0-9-]+\.web\.app$/;
if (
  baseUrl.protocol !== 'https:' ||
  !allowedHost.test(baseUrl.hostname) ||
  baseUrl.username ||
  baseUrl.password
) {
  console.error(
    'Refusing to inspect a URL that is not the dedicated synthetic-review staging preview.'
  );
  process.exit(2);
}
baseUrl.pathname = '/';
baseUrl.search = '';
baseUrl.hash = '';

const checks = [];
const assets = new Set();
const record = (name, passed, detail) => {
  checks.push({ name, passed, detail });
};

const requiredHeaders = [
  ['content-security-policy', "default-src 'self'"],
  ['content-security-policy', "frame-ancestors 'none'"],
  ['content-security-policy', "require-trusted-types-for 'script'"],
  ['cross-origin-opener-policy', 'same-origin'],
  ['cross-origin-resource-policy', 'same-origin'],
  ['referrer-policy', 'no-referrer'],
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['x-robots-tag', 'noindex']
];

function checkHeaders(response, label, expectedCache) {
  for (const [header, expected] of requiredHeaders) {
    const actual = response.headers.get(header) ?? '';
    record(
      `${label}: ${header} contains ${expected}`,
      actual.toLowerCase().includes(expected.toLowerCase()),
      actual || '(missing)'
    );
  }
  const cacheControl = response.headers.get('cache-control') ?? '';
  record(
    `${label}: cache policy`,
    expectedCache.every((token) =>
      cacheControl.toLowerCase().includes(token.toLowerCase())
    ),
    cacheControl || '(missing)'
  );
}

async function inspectHtml(path, label, markers) {
  const url = new URL(path, baseUrl);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'beauessence-preview-verifier/1' },
      redirect: 'follow'
    });
    const body = await response.text();
    record(`${label}: HTTP 200`, response.status === 200, `${response.status}`);
    record(
      `${label}: remains on staging host`,
      response.url.startsWith(baseUrl.origin),
      response.url
    );
    checkHeaders(response, label, ['no-cache']);
    for (const marker of markers) {
      record(
        `${label}: contains ${marker}`,
        body.includes(marker),
        body.includes(marker) ? 'present' : 'missing'
      );
    }

    for (const match of body.matchAll(
      /\b(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g
    )) {
      const asset = new URL(match[1], url);
      if (asset.origin === baseUrl.origin) assets.add(asset.href);
    }
  } catch (error) {
    record(`${label}: fetch completed`, false, String(error));
  }
}

await inspectHtml('/', 'workbench entry', [
  'ONLINE PREVIEW',
  '公開預覽，網址持有人皆可存取'
]);
await inspectHtml('/booking', 'patient entry', [
  'id="patient-name"',
  'id="patient-phone"',
  'id="patient-birth"',
  'id="patient-national-id"',
  '資料只會保存在我這台裝置的瀏覽器'
]);

record(
  'HTML references content-hashed JS/CSS assets',
  assets.size > 0 &&
    [...assets].every((asset) =>
      /\.[0-9a-f]{10}\.(?:js|css)$/.test(new URL(asset).pathname)
    ),
  `${assets.size} unique JS/CSS assets`
);

for (const asset of [...assets].sort()) {
  const label = `asset ${new URL(asset).pathname}`;
  try {
    const response = await fetch(asset, {
      headers: { 'user-agent': 'beauessence-preview-verifier/1' }
    });
    record(`${label}: HTTP 200`, response.status === 200, `${response.status}`);
    checkHeaders(response, label, ['public', 'max-age=31536000', 'immutable']);
  } catch (error) {
    record(`${label}: fetch completed`, false, String(error));
  }
}

let commit = process.env.GITHUB_SHA ?? 'unknown';
if (commit === 'unknown') {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD']);
    commit = result.stdout.trim();
  } catch {
    // The URL and checks remain useful when the verifier runs outside a clone.
  }
}

const passed = checks.every((check) => check.passed);
const evidence = {
  schemaVersion: 1,
  kind: 'synthetic-preview-verification',
  generatedAt: new Date().toISOString(),
  previewUrl: baseUrl.href,
  commit,
  conclusion: passed ? 'success' : 'failure',
  checks
};

const failures = checks.filter((check) => !check.passed);
const summary = [
  '# Synthetic preview deployment evidence',
  '',
  `- Conclusion: **${evidence.conclusion}**`,
  `- Preview: ${baseUrl.href}`,
  `- Commit: \`${commit}\``,
  `- Generated: ${evidence.generatedAt}`,
  `- Checks: ${checks.length - failures.length}/${checks.length} passed`,
  '',
  ...(failures.length === 0
    ? ['All staging preview checks passed.']
    : [
        '## Failed checks',
        '',
        ...failures.map(
          ({ name, detail }) =>
            `- ${name.replaceAll('\n', ' ')} — ${detail.replaceAll('\n', ' ')}`
        )
      ]),
  ''
].join('\n');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    join(outputDirectory, 'preview-deployment.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  ),
  writeFile(join(outputDirectory, 'preview-deployment.md'), summary, 'utf8')
]);

console.log(
  `Preview evidence written to ${outputDirectory} (${evidence.conclusion}; ${checks.length - failures.length}/${checks.length} checks passed).`
);
for (const failure of failures) {
  console.error(`- ${failure.name}: ${failure.detail}`);
}
if (!passed) process.exitCode = 1;
