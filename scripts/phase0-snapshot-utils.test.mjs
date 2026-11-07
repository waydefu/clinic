import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  commandSucceeds,
  outputLines,
  parseFirebaseLoginAccount,
  redactAccount,
  runCommand
} from './phase0-snapshot-utils.mjs';

describe('Phase 0 account snapshot parsing', () => {
  it('parses the supported Firebase login:list text output', () => {
    expect(
      parseFirebaseLoginAccount('Logged in as operator@example.invalid')
    ).toBe('operator@example.invalid');
  });

  it('returns no account when Firebase has no authorized account', () => {
    expect(
      parseFirebaseLoginAccount(
        '⚠  No authorized accounts, run "firebase login"'
      )
    ).toBe('');
  });

  it('redacts account values to their domain', () => {
    expect(redactAccount('operator@example.invalid')).toBe(
      'domain=example.invalid'
    );
    expect(redactAccount('UNVERIFIED')).toBe('UNVERIFIED');
  });

  it('requires the gcloud configuration to be active', () => {
    const source = readFileSync(
      new URL('./phase0-snapshot.mjs', import.meta.url),
      'utf8'
    );
    // The filter is now one argv element; it keeps the same meaning as before.
    expect(source).toContain("'--filter=is_active=true'");
  });

  it('runs every command as an argv array, with no shell and no split on spaces', () => {
    const source = readFileSync(
      new URL('./phase0-snapshot.mjs', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(/bash|shell:\s*true|\.split\(' '\)|spawnSync/);
  });
});

// A real child process stands in for the fake executable: node prints the
// arguments it received, so spaces, quotes and shell metacharacters show up
// exactly as the command saw them.
const echoArgs = [
  process.execPath,
  '-e',
  'console.log(JSON.stringify(process.argv.slice(1)))'
];

describe('argv command runner (E2-07)', () => {
  it('passes spaces, quotes and shell metacharacters through as single arguments', () => {
    const tricky = [
      'a b',
      `it's "quoted"`,
      '$(whoami); echo x',
      '--organization=1 2'
    ];
    expect(JSON.parse(runCommand([...echoArgs, ...tricky]))).toEqual(tricky);
  });

  it('preserves empty args at start/middle/end and whitespace-only args', () => {
    const args = ['', 'middle', '', '  ', ''];
    expect(JSON.parse(runCommand([...echoArgs, ...args]))).toEqual(args);
  });

  it('returns an empty string for a missing command or a non-zero exit', () => {
    expect(runCommand(['definitely-not-a-real-cli-name', 'x'])).toBe('');
    expect(runCommand([process.execPath, '-e', 'process.exit(3)'])).toBe('');
  });

  it('does not trust stdout from a command that failed', () => {
    expect(
      runCommand([
        process.execPath,
        '-e',
        'console.log("partial"); process.exit(1)'
      ])
    ).toBe('');
  });

  it('hands the command to spawn with shell off and the argv split once', () => {
    const calls = [];
    const spawn = (...call) => {
      calls.push(call);
      return { status: 0, stdout: ' ok \n' };
    };
    expect(
      runCommand(['gcloud', 'config', 'get-value', 'a b'], { cwd: 'x', spawn })
    ).toBe('ok');
    expect(calls).toEqual([
      [
        'gcloud',
        ['config', 'get-value', 'a b'],
        { cwd: 'x', encoding: 'utf8', stdio: 'pipe', shell: false }
      ]
    ]);
  });

  it('reports only the exit status when asked whether a command succeeds', () => {
    expect(commandSucceeds([process.execPath, '-e', 'process.exit(0)'])).toBe(
      true
    );
    expect(commandSucceeds([process.execPath, '-e', 'process.exit(2)'])).toBe(
      false
    );
    expect(commandSucceeds(['definitely-not-a-real-cli-name'])).toBe(false);
    const calls = [];
    commandSucceeds(['gcloud', 'auth'], {
      spawn: (...call) => {
        calls.push(call);
        return { status: 0 };
      }
    });
    expect(calls[0][2]).toEqual({
      cwd: undefined,
      stdio: 'ignore',
      shell: false
    });
  });

  it('keeps non-empty trimmed lines', () => {
    expect(outputLines(' a \n\n b\n')).toEqual(['a', 'b']);
    expect(outputLines('')).toEqual([]);
  });
});
