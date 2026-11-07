import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sheet = read('docs/plans/2026-10-25-external-acceptance-runsheet.md');
const main = read('infra/terraform/c1-internal-test-run/main.tf');
const variables = read('infra/terraform/c1-internal-test-run/variables.tf');

function bindings(name) {
  const body = main.match(
    new RegExp(`  ${name} = \\{([\\s\\S]*?)\\n  \\}`)
  )?.[1];
  if (!body) throw new Error(`Missing source map: ${name}`);
  return [...body.matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm)].map(
    ([, env, secret]) => [env, secret]
  );
}

describe('external acceptance runsheet source boundaries', () => {
  it('uses option A without blanket pre-handler rejection', () => {
    expect(sheet).toContain('直連請求不必一律在 handler 前被拒絕');
    expect(sheet).toContain('來源選取不是身分保證');
    expect(sheet).not.toContain(
      '確認在 unauthenticated lookup／booking handler 執行前就拒絕'
    );
    expect(sheet).not.toContain('未授權直連必須在 handler 前被拒絕');
  });

  it('keeps both paths and denied cases', () => {
    for (const label of [
      'Hosting rewrite',
      'direct Run',
      'handler counter',
      'writer counter'
    ]) {
      expect(sheet).toContain(label);
    }
    expect(sheet).toContain('授權／limiter／gate');
    expect(sheet).toContain('無副作用拒絕');
  });

  it('keeps identity locks and missing-counter evidence explicit', () => {
    for (const label of [
      'lookup_identity_failure',
      '換 IP 不能重置鎖定',
      '格式錯誤／多地址',
      '未核准 host',
      '沒有可對外讀取的身分桶、handler／writer 計數工具',
      'NOT_PROVEN'
    ]) {
      expect(sheet).toContain(label);
    }
  });

  it.each([
    ['api_secret_env', 'api_secret_versions'],
    ['worker_secret_env', 'worker_secret_versions']
  ])(
    'lists source-declared %s names with exact variable line references',
    (map, input) => {
      for (const [env, secret] of bindings(map)) {
        const pattern = new RegExp(`^\\| \`${secret}\` \\| (.+)$`, 'm');
        const row = sheet.match(pattern)?.[1];
        expect(row).toBeDefined();
        const line = Number(row?.match(/variables\.tf:(\d+)/)?.[1]);
        expect(variables.split('\n')[line - 1]).toContain(
          `var.${input}.${env}`
        );
      }
      expect(sheet).toContain('各項數字版本均為 UNKNOWN');
      expect(sheet).not.toContain('尚未由業主提供名稱');
    }
  );
});
