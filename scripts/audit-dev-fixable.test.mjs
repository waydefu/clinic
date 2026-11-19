import { describe, expect, it, vi } from 'vitest';
import {
  classifyAdvisories,
  fetchNpmPublishedVersions,
  formatAuditReport,
  hasDeclaredPatch,
  parseAuditJson,
  runAuditDevFixable,
  satisfiesPatchedRange
} from './audit-dev-fixable.mjs';

function makeAdvisory(overrides = {}) {
  return {
    id: 1234567,
    github_advisory_id: 'GHSA-fc5q-39xc-vjpf',
    module_name: 'picomatch',
    severity: 'high',
    title: 'Synthetic ReDoS advisory',
    vulnerable_versions: '<=4.0.7',
    patched_versions: '>=4.0.8',
    url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
    findings: [
      {
        version: '4.0.7',
        paths: ['.>vitest>tinyglobby>picomatch'],
        dev: true,
        optional: false,
        bundled: false
      }
    ],
    ...overrides
  };
}

function makeReport(advisories = []) {
  const map = {};
  for (const [index, advisory] of advisories.entries()) {
    map[String(advisory.id ?? index + 1)] = advisory;
  }
  return {
    advisories: map,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: advisories.filter((a) => a.severity === 'high').length,
        critical: advisories.filter((a) => a.severity === 'critical').length
      }
    }
  };
}

describe('hasDeclaredPatch', () => {
  it.each([
    null,
    undefined,
    '',
    '   ',
    '<0.0.0',
    '< 0.0.0',
    'None',
    'none',
    'N/A',
    '-'
  ])('treats %j as no declared patch', (value) => {
    expect(hasDeclaredPatch(value)).toBe(false);
  });

  it.each(['>=4.0.8', '>=3.0.4 <4.0.0 || >=4.0.8', '^1.2.3', '2.0.1'])(
    'treats %s as a declared patch range',
    (value) => {
      expect(hasDeclaredPatch(value)).toBe(true);
    }
  );
});

describe('satisfiesPatchedRange', () => {
  it('matches standard comparator, compound and OR ranges', () => {
    expect(satisfiesPatchedRange('4.0.8', '>=4.0.8')).toBe(true);
    expect(satisfiesPatchedRange('4.0.7', '>=4.0.8')).toBe(false);
    expect(satisfiesPatchedRange('3.0.4', '>=3.0.4 <4.0.0 || >=4.0.8')).toBe(
      true
    );
    expect(satisfiesPatchedRange('4.0.7', '>=3.0.4 <4.0.0 || >=4.0.8')).toBe(
      false
    );
    expect(satisfiesPatchedRange('4.0.8', '>=3.0.4 <4.0.0 || >=4.0.8')).toBe(
      true
    );
    expect(satisfiesPatchedRange('1.2.5', '^1.2.3')).toBe(true);
    expect(satisfiesPatchedRange('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesPatchedRange('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfiesPatchedRange('1.3.0', '~1.2.3')).toBe(false);
  });

  // 上游僅發 prerelease（例如 4.0.8-alpha.0）不算正式修補版滿足 >=4.0.8。
  it('does not treat a prerelease as satisfying a stable patch range', () => {
    expect(satisfiesPatchedRange('4.0.8-alpha.0', '>=4.0.8')).toBe(false);
    expect(satisfiesPatchedRange('4.0.8-alpha.1', '>=4.0.8-alpha.0')).toBe(
      true
    );
  });

  it('returns false on invalid version or unparseable range', () => {
    expect(satisfiesPatchedRange('not-a-semver', '>=1.0.0')).toBe(false);
    expect(satisfiesPatchedRange('1.0.0', 'invalid range!!')).toBe(false);
  });
});

describe('classifyAdvisories and runAuditDevFixable', () => {
  it('blocks a dev high/critical advisory when a patched version is published', async () => {
    const advisory = makeAdvisory({
      module_name: 'picomatch',
      patched_versions: '>=4.0.8'
    });
    const result = await runAuditDevFixable({
      runAudit: async (args) => ({
        stdout: JSON.stringify(
          args.includes('--prod') ? makeReport([]) : makeReport([advisory])
        ),
        stderr: '',
        exitCode: args.includes('--prod') ? 0 : 1,
        spawnError: null
      }),
      fetchPublishedVersions: async () => ['4.0.6', '4.0.7', '4.0.8']
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.blocking).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.report.stderrLines.join('\n')).toContain(
      'GHSA-fc5q-39xc-vjpf'
    );
    expect(result.report.stderrLines.join('\n')).toContain('4.0.8');
  });

  it.each(['<0.0.0', '', null, 'None'])(
    'passes with a prominent warning when dev high/critical has patched_versions=%j',
    async (patchedVersions) => {
      const advisory = makeAdvisory({
        id: 2001,
        github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
        module_name: 'dev-only-tool',
        severity: 'critical',
        patched_versions: patchedVersions,
        findings: [
          {
            version: '1.0.0',
            paths: ['.>eslint>dev-only-tool'],
            dev: true
          }
        ]
      });
      const fetcher = vi.fn();

      const result = await runAuditDevFixable({
        runAudit: async (args) => ({
          stdout: JSON.stringify(
            args.includes('--prod') ? makeReport([]) : makeReport([advisory])
          ),
          stderr: '',
          exitCode: args.includes('--prod') ? 0 : 1,
          spawnError: null
        }),
        fetchPublishedVersions: fetcher
      });

      expect(fetcher).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.blocking).toEqual([]);
      expect(result.warnings).toHaveLength(1);

      const warningOutput = result.report.stderrLines.join('\n');
      expect(warningOutput).toContain('GHSA-aaaa-bbbb-cccc');
      expect(warningOutput).toContain('dev-only-tool');
      expect(warningOutput).toContain('critical');
      expect(warningOutput).toContain('.>eslint>dev-only-tool');
    }
  );

  it('passes with a prominent warning when patched_versions is >=4.0.8 but npm only has up to 4.0.7', async () => {
    const advisory = makeAdvisory({
      module_name: 'picomatch',
      patched_versions: '>=4.0.8',
      findings: [
        {
          version: '4.0.7',
          paths: ['.>vitest>tinyglobby>picomatch', '.>eslint>picomatch'],
          dev: true
        }
      ]
    });

    const result = await runAuditDevFixable({
      runAudit: async (args) => ({
        stdout: JSON.stringify(
          args.includes('--prod') ? makeReport([]) : makeReport([advisory])
        ),
        stderr: '',
        exitCode: args.includes('--prod') ? 0 : 1,
        spawnError: null
      }),
      fetchPublishedVersions: async () => ['4.0.5', '4.0.6', '4.0.7']
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toHaveLength(1);

    const warningOutput = result.report.stderrLines.join('\n');
    expect(warningOutput).toContain('GHSA-fc5q-39xc-vjpf');
    expect(warningOutput).toContain('picomatch');
    expect(warningOutput).toContain('.>vitest>tinyglobby>picomatch');
    expect(warningOutput).toContain('>=4.0.8');
    expect(warningOutput).toContain('4.0.7');
  });

  // 網路異常絕不能放行漏洞：查詢 npm registry 失敗必須 fail-closed。
  it('fails closed when npm registry lookup fails', async () => {
    const advisory = makeAdvisory({ patched_versions: '>=4.0.8' });

    const result = await runAuditDevFixable({
      runAudit: async (args) => ({
        stdout: JSON.stringify(
          args.includes('--prod') ? makeReport([]) : makeReport([advisory])
        ),
        stderr: '',
        exitCode: args.includes('--prod') ? 0 : 1,
        spawnError: null
      }),
      fetchPublishedVersions: async () => {
        throw new Error('HTTP 503 Service Unavailable');
      }
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.blocking).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.report.stderrLines.join('\n')).toContain('fail-closed');
    expect(result.report.stderrLines.join('\n')).toContain('HTTP 503');
  });

  it('fails closed when patched_versions cannot be parsed as a semver range', async () => {
    const advisory = makeAdvisory({
      patched_versions: 'custom-upstream-branch-only'
    });

    const classification = await classifyAdvisories({
      allReport: makeReport([advisory]),
      prodReport: makeReport([]),
      fetchPublishedVersions: async () => ['4.0.7']
    });

    expect(classification.ok).toBe(false);
    expect(classification.blocking).toHaveLength(1);
    expect(classification.blocking[0].reason).toContain('fail-closed');
  });

  it('fails and prints both blocking and unpatched warning advisories when mixed', async () => {
    const fixable = makeAdvisory({
      id: 3001,
      github_advisory_id: 'GHSA-1111-2222-3333',
      module_name: 'fixable-pkg',
      patched_versions: '>=2.0.1',
      findings: [
        { version: '2.0.0', paths: ['.>vitest>fixable-pkg'], dev: true }
      ]
    });
    const unpatched = makeAdvisory({
      id: 3002,
      github_advisory_id: 'GHSA-4444-5555-6666',
      module_name: 'unpatched-pkg',
      patched_versions: '<0.0.0',
      findings: [
        { version: '1.0.0', paths: ['.>eslint>unpatched-pkg'], dev: true }
      ]
    });

    const result = await runAuditDevFixable({
      runAudit: async (args) => ({
        stdout: JSON.stringify(
          args.includes('--prod')
            ? makeReport([])
            : makeReport([fixable, unpatched])
        ),
        stderr: '',
        exitCode: args.includes('--prod') ? 0 : 1,
        spawnError: null
      }),
      fetchPublishedVersions: async (pkg) =>
        pkg === 'fixable-pkg' ? ['2.0.0', '2.0.1'] : []
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.blocking).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);

    const output = result.report.stderrLines.join('\n');
    expect(output).toContain('GHSA-1111-2222-3333');
    expect(output).toContain('GHSA-4444-5555-6666');
  });

  // 正式依賴保護：即使無修補版 (<0.0.0)，只要出現在 prod audit 就一律阻斷。
  it('always blocks a prod high/critical advisory even when patched_versions is <0.0.0', async () => {
    const prodAdvisory = makeAdvisory({
      id: 4001,
      github_advisory_id: 'GHSA-9999-8888-7777',
      module_name: 'fastify',
      severity: 'high',
      patched_versions: '<0.0.0',
      findings: [{ version: '5.12.0', paths: ['apps/api>fastify'], dev: false }]
    });

    const result = await runAuditDevFixable({
      runAudit: async () => ({
        stdout: JSON.stringify(makeReport([prodAdvisory])),
        stderr: '',
        exitCode: 1,
        spawnError: null
      }),
      fetchPublishedVersions: async () => ['5.12.0']
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].scope).toBe('prod');
    expect(result.warnings).toEqual([]);
    expect(result.report.stderrLines.join('\n')).toContain('正式相依');
  });

  it('ignores low and moderate advisories in audit:all', async () => {
    const lowAdv = makeAdvisory({
      id: 5001,
      github_advisory_id: 'GHSA-low1-low2-low3',
      module_name: 'low-pkg',
      severity: 'low',
      patched_versions: '>=2.0.0'
    });
    const modAdv = makeAdvisory({
      id: 5002,
      github_advisory_id: 'GHSA-mod1-mod2-mod3',
      module_name: 'mod-pkg',
      severity: 'moderate',
      patched_versions: '>=3.0.0'
    });
    const fetcher = vi.fn();

    const result = await runAuditDevFixable({
      runAudit: async () => ({
        stdout: JSON.stringify(makeReport([lowAdv, modAdv])),
        stderr: '',
        exitCode: 0,
        spawnError: null
      }),
      fetchPublishedVersions: fetcher
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // CONTRIBUTING.md #8：掃描失敗不得被誤判成 0 漏洞的假綠燈。
  it.each([
    {
      name: 'non-JSON output',
      raw: {
        stdout: 'ERR_PNPM_AUDIT_BAD_RESPONSE',
        stderr: '502',
        exitCode: 1,
        spawnError: null
      }
    },
    {
      name: 'JSON containing error object',
      raw: {
        stdout: JSON.stringify({
          error: {
            code: 'ERR_PNPM_AUDIT_BAD_RESPONSE',
            summary: 'registry 502'
          }
        }),
        stderr: '',
        exitCode: 1,
        spawnError: null
      }
    },
    {
      name: 'spawn error (missing lockfile or binary)',
      raw: {
        stdout: '',
        stderr: '',
        exitCode: 1,
        spawnError: new Error('spawn corepack ENOENT')
      }
    },
    {
      name: 'non-zero exit with empty advisories',
      raw: {
        stdout: JSON.stringify({ advisories: {}, metadata: {} }),
        stderr: 'unexpected lockfile error',
        exitCode: 1,
        spawnError: null
      }
    }
  ])('fails closed on pnpm audit failure: $name', async ({ raw }) => {
    const result = await runAuditDevFixable({
      runAudit: async (args) =>
        args.includes('--prod')
          ? {
              stdout: JSON.stringify(makeReport([])),
              stderr: '',
              exitCode: 0,
              spawnError: null
            }
          : raw,
      fetchPublishedVersions: async () => []
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.toolErrors.length).toBeGreaterThan(0);
    expect(result.report.stderrLines.join('\n')).toContain('fail-closed');
  });

  // CONTRIBUTING.md #8：乾淨工作區、含刪除檔案的髒工作區、全新 clone（無 node_modules）
  // 皆只依賴 pnpm audit 的 lockfile 輸出，不依賴工作區檔案狀態或第三方套件。
  it('behaves deterministically across clean, dirty-with-deletions and fresh-clone trees', async () => {
    const result = await runAuditDevFixable({
      runAudit: async () => ({
        stdout: JSON.stringify(makeReport([])),
        stderr: '',
        exitCode: 0,
        spawnError: null
      }),
      fetchPublishedVersions: async () => []
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.report.stdoutLines).toEqual([
      'Dev-fixable audit passed (0 high/critical advisories).'
    ]);
  });
});

describe('fetchNpmPublishedVersions', () => {
  it('queries registry with install-v1+json Accept header and encodes scoped names', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        name: '@scope/pkg',
        versions: { '1.0.0': {}, '1.0.1': {} }
      })
    }));

    const versions = await fetchNpmPublishedVersions('@scope/pkg', {
      fetchImpl: fetchMock,
      timeoutMs: 5_000
    });

    expect(versions).toEqual(['1.0.0', '1.0.1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://registry.npmjs.org/%40scope%2Fpkg');
    expect(options.headers.Accept).toBe('application/vnd.npm.install-v1+json');
    expect(options.signal).toBeDefined();
  });

  it('rejects on non-200 HTTP response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    }));

    await expect(
      fetchNpmPublishedVersions('picomatch', { fetchImpl: fetchMock })
    ).rejects.toThrow('HTTP 500');
  });
});

describe('parseAuditJson and formatAuditReport helpers', () => {
  it('rejects JSON missing the advisories object', () => {
    const parsed = parseAuditJson({
      stdout: JSON.stringify({ metadata: {} }),
      stderr: '',
      exitCode: 0,
      spawnError: null,
      label: 'test'
    });
    expect(parsed.ok).toBe(false);
  });

  it('produces a clean pass line when there are no findings', () => {
    const formatted = formatAuditReport({
      ok: true,
      blocking: [],
      warnings: []
    });
    expect(formatted.stderrLines).toEqual([]);
    expect(formatted.stdoutLines).toEqual([
      'Dev-fixable audit passed (0 high/critical advisories).'
    ]);
  });
});
