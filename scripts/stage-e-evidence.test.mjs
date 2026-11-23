import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  assembleStageEEvidence,
  resolveStageEOutputPath,
  runStageEEvidenceCli,
  syntheticMonitoringProofs
} from './stage-e-evidence.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('stage E evidence', () => {
  it('proves monitoring signals without claiming human delivery or a deploy', () => {
    const proofs = syntheticMonitoringProofs();
    expect(proofs.every((item) => item.pass)).toBe(true);
    const evidence = assembleStageEEvidence({
      now: () => '2026-09-15T00:00:00.000Z',
      sha: () => HEAD,
      nodeVersion: 'v24.0.0',
      environment: 'internal_test'
    });
    expect(evidence.sha).toBe(HEAD);
    expect(evidence.timestamp).toBe('2026-09-15T00:00:00.000Z');
    expect(evidence.humanNotificationProven).toBe(false);
    expect(evidence.verdicts.INTERNAL_PREPRODUCTION_COMPLETE).toBe('FAIL');
    expect(evidence.verdicts.PRODUCTION_CALENDAR_INBOUND).toBe(
      'GO_LIVE_DEFERRED'
    );
    expect(JSON.stringify(evidence)).not.toMatch(/09\d{8}/);
    expect(evidence.pass).toBe(true);
  });

  it('rejects a non-SHA as missing exact-head capture', () => {
    const evidence = assembleStageEEvidence({
      sha: () => 'short'
    });
    expect(evidence.pass).toBe(false);
    expect(
      evidence.checks.find((item) => item.id === 'exact_sha_captured')?.pass
    ).toBe(false);
  });
});

describe('stage E CLI output containment', () => {
  const rootDir = resolve('/tmp/synthetic-workspace');
  const outsidePath = resolve('/tmp/outside-stage-e.json');

  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return {
      out,
      err,
      stdout: { write: (chunk: string) => out.push(chunk) },
      stderr: { write: (chunk: string) => err.push(chunk) },
      writeFile: vi.fn()
    };
  };

  it('does not write a file by default when --out is omitted', () => {
    const harness = io();
    const code = runStageEEvidenceCli({
      argv: [],
      stdout: harness.stdout,
      stderr: harness.stderr,
      writeFile: harness.writeFile,
      rootDir
    });
    expect(code).toBe(0);
    expect(harness.writeFile).not.toHaveBeenCalled();
    expect(harness.out.join('')).toContain('"kind": "stage_e_evidence"');
  });

  it('writes to a contained path inside the workspace root', () => {
    const harness = io();
    const code = runStageEEvidenceCli({
      argv: ['--out', 'output/evidence/stage-e.json'],
      stdout: harness.stdout,
      stderr: harness.stderr,
      writeFile: harness.writeFile,
      rootDir
    });
    expect(code).toBe(0);
    expect(harness.writeFile).toHaveBeenCalledTimes(1);
    expect(harness.writeFile).toHaveBeenCalledWith(
      join(rootDir, 'output', 'evidence', 'stage-e.json'),
      expect.stringContaining('"kind": "stage_e_evidence"')
    );
  });

  it.each([
    ['missing value', ['--out']],
    ['empty path', ['--out', '']],
    ['parent traversal', ['--out', '../escape.json']],
    ['repo root', ['--out', '.']],
    ['external absolute path', ['--out', outsidePath]]
  ])('fails closed before writing on %s', (_label, argv) => {
    const harness = io();
    const code = runStageEEvidenceCli({
      argv,
      stdout: harness.stdout,
      stderr: harness.stderr,
      writeFile: harness.writeFile,
      rootDir
    });
    expect(code).toBe(2);
    expect(harness.writeFile).not.toHaveBeenCalled();
    expect(harness.err.join('')).toContain('Usage:');
    expect(() => resolveStageEOutputPath('../escape.json', rootDir)).toThrow();
  });
});
