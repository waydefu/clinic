import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mirrorPriorities = new Map([
  ['https://archive.ubuntu.com/ubuntu/', 1],
  ['https://security.ubuntu.com/ubuntu/', 2],
  ['http://azure.archive.ubuntu.com/ubuntu/', 3]
]);
const acquireBounds = new Map([
  ['Acquire::Retries', '1'],
  ['Acquire::http::Timeout', '15'],
  ['Acquire::https::Timeout', '15']
]);

export function prioritizeUbuntuMirrors(text) {
  const seen = new Set();
  const prepared = text.split(/\r?\n/).map((line) => {
    if (line.trim() === '' || line.trimStart().startsWith('#')) return line;
    const entry = /^(\S+)(\s+)priority:\d+(\s*(?:#.*)?)$/.exec(line);
    if (!entry || !mirrorPriorities.has(entry[1]) || seen.has(entry[1])) {
      throw new Error('Unsupported or ambiguous CI Ubuntu mirror list.');
    }
    seen.add(entry[1]);
    return `${entry[1]}${entry[2]}priority:${mirrorPriorities.get(entry[1])}${entry[3]}`;
  });
  if (seen.size !== mirrorPriorities.size) {
    throw new Error(
      'Incomplete CI Ubuntu mirror list; no repositories changed.'
    );
  }
  return prepared.join('\n');
}

export function assertEffectiveAptBounds(dump) {
  for (const [key, expected] of acquireBounds) {
    const values = dump
      .split(/\r?\n/)
      .filter((line) => line.startsWith(`${key} `))
      .map((line) => /^\S+ "([^"]+)";$/.exec(line)?.[1]);
    if (values.length !== 1 || values[0] !== expected) {
      throw new Error(`Effective APT acquire bounds did not apply: ${key}.`);
    }
  }
}

function prepareCiApt() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('APT preparation is limited to GitHub Actions runners.');
  }
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('APT preparation requires the existing Linux x64 runner.');
  }
  if (!/^ID="?ubuntu"?$/m.test(readFileSync('/etc/os-release', 'utf8'))) {
    throw new Error('APT preparation requires an Ubuntu runner.');
  }
  const mirrorFile = '/etc/apt/apt-mirrors.txt';
  const prepared = prioritizeUbuntuMirrors(readFileSync(mirrorFile, 'utf8'));
  const config = [...acquireBounds]
    .map(([key, value]) => `${key} "${value}";`)
    .join('\n');

  // Only these existing, signed Ubuntu sources are reprioritised. APT's
  // certificates, signature checks, keys and source definitions stay intact.
  execFileSync('sudo', ['tee', mirrorFile], {
    input: prepared,
    stdio: ['pipe', 'ignore', 'pipe']
  });
  // APT loads parts in filename order; use a late leaf and verify the merged
  // result so an image override cannot silently restore the old waits.
  execFileSync('sudo', ['tee', '/etc/apt/apt.conf.d/zzz-clinic-acquire'], {
    input: `${config}\n`,
    stdio: ['pipe', 'ignore', 'pipe']
  });
  const effective = execFileSync('apt-config', ['dump'], { encoding: 'utf8' });
  assertEffectiveAptBounds(effective);
  console.log('CI APT: existing Ubuntu HTTPS archives prioritised.');
  console.log(config);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  try {
    prepareCiApt();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
