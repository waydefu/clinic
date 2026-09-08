import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  defaultEntryRoutes,
  validatePerformanceArtifact
} from './web-performance-matrix.mjs';
import { validateA11yArtifact, validateWaivers } from './web-a11y-waivers.mjs';

// WEB-P0-02／03 證據合併：把各 Playwright worker 寫下的分片組成
// canonical artifact 並驗證完整性。
//
// 為什麼需要合併：`fullyParallel: true` 下同一支 spec 會分散到多個 worker
// 行程，每個 worker 只能看到自己跑的那幾筆。若各 worker 直接寫同一個
// `web-<kind>-<sha>.json`，最後寫完的那個會蓋掉其他人的記錄，上傳的證據就
// 是不確定的殘缺品（已在 CI 實際踩到）。因此約定：
//   - spec 內每個測試只寫自己的分片，不做跨測試的完整性斷言；
//   - 分片檔名：`web-performance-<sha>--<slug>.json`／
//     `web-accessibility-<sha>--<slug>.json`，放在 `output/evidence/shards/`；
//     slug 是路由＋profile／state 的可讀衍生，merge 只認前綴與 SHA；
//   - 這支腳本在 CI 的瀏覽器步驟之後執行（失敗也執行），合併、驗證、
//     寫出 canonical artifact，缺件就以非零結束讓 job 變紅。
//
// 分片內容：
//   - perf：`{ schemaVersion: 1, headSha, record }`
//   - a11y：`{ schemaVersion: 1, headSha, scan, evaluatedRuleIds: [...] }`

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const EVIDENCE_DIR_PARTS = ['output', 'evidence'];
export const SHARD_DIR_PARTS = ['output', 'evidence', 'shards'];

const SHARD_PATTERN =
  /^web-(performance|accessibility)-([0-9a-f]{40})--.+\.json$/;

/**
 * 工作臺／患者端互動狀態掃描（單一來源）。
 *
 * 路由殼與具體 clinic 路由由 public-pages.json 與 CLINIC_ROUTES 推導；
 * 只有這四個互動狀態是手寫的——tests/e2e/accessibility.spec.ts 的 scan()
 * 呼叫必須逐字使用這裡的字串，否則 merge 會以「未知掃描」讓 gate 變紅。
 */
export const WORKBENCH_SCAN_STATES = [
  { route: '/staff', state: 'workbench-appointments' },
  { route: '/staff', state: 'workbench-reschedule' },
  { route: '/booking', state: 'patient-reschedule' },
  { route: '/staff', state: 'workbench-pagination' }
];

/**
 * 期望 axe 掃描矩陣：字面殼（state default）＋具體 clinic 路由
 * （state default）＋互動狀態，依 route＋state 去重（`/clinic` 同時是
 * 殼與具體路由，只掃一次）。
 */
export function expectedA11yScans({ shellRoutes, clinicRoutes }) {
  const seen = new Set();
  const expected = [];
  for (const route of [...shellRoutes, ...clinicRoutes]) {
    const key = `${route} [default]`;
    if (seen.has(key)) continue;
    seen.add(key);
    expected.push({ route, state: 'default' });
  }
  for (const state of WORKBENCH_SCAN_STATES) {
    const key = `${state.route} [${state.state}]`;
    if (seen.has(key)) continue;
    seen.add(key);
    expected.push({ ...state });
  }
  return expected;
}

export function headSha() {
  const fromCi = process.env['GITHUB_SHA'];
  if (fromCi !== undefined && fromCi !== '') return fromCi;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    shell: false
  });
  if (result.error !== undefined) {
    throw new Error(
      `merge-web-evidence: git rev-parse failed: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `merge-web-evidence: git rev-parse exited ${result.status}`
    );
  }
  const sha = String(result.stdout ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('merge-web-evidence: git rev-parse returned malformed SHA');
  }
  return sha;
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/** 合併 perf 分片：回傳 canonical records（依 route＋profile 去重，保留首筆）。 */
export function mergePerformanceShards(shards) {
  const seen = new Set();
  const records = [];
  for (const shard of shards) {
    const record = shard?.record;
    if (record === undefined || record === null) continue;
    const key = `${record.profile} ${record.route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(record);
  }
  return records;
}

/** 合併 a11y 分片：回傳 scans 與本輪評估過的 rule id 聯集。 */
export function mergeA11yShards(shards) {
  const seen = new Set();
  const scans = [];
  const evaluatedRuleIds = new Set();
  for (const shard of shards) {
    if (shard?.scan !== undefined && shard?.scan !== null) {
      const key = `${shard.scan.route} [${shard.scan.state}]`;
      if (!seen.has(key)) {
        seen.add(key);
        scans.push(shard.scan);
      }
    }
    for (const id of shard?.evaluatedRuleIds ?? []) evaluatedRuleIds.add(id);
  }
  return { scans, evaluatedRuleIds: [...evaluatedRuleIds] };
}

/**
 * 純函式合併＋驗證核心（可單元測試，不碰檔案系統）。
 *
 * @param expect 'perf'｜'a11y'｜'both'｜'none'：CI 依 matrix.group 傳入；
 *   被期望的種類若零分片即失敗（該跑的 spec 沒產出證據），'none' 直接通過。
 */
export function mergeEvidence({
  budgets,
  shellRoutes,
  clinicRoutes,
  waivers,
  today,
  sha,
  perfShards,
  a11yShards,
  expect: expected
}) {
  const failures = [];
  let perfArtifact = null;
  let a11yArtifact = null;

  for (const shard of [...perfShards, ...a11yShards]) {
    if (shard?.headSha !== sha) {
      failures.push(
        `分片的 head SHA ${String(shard?.headSha)} 與本次 ${sha} 不一致：陳舊證據不得混入。`
      );
    }
  }

  const entryRoutes = defaultEntryRoutes({ clinicRoutes });

  if (expected === 'perf' || expected === 'both') {
    if (perfShards.length === 0) {
      failures.push('期望有效能分片卻一個都沒有：量測 spec 是否被跳過？');
    } else {
      perfArtifact = {
        schemaVersion: 1,
        headSha: sha,
        generatedBy: 'scripts/merge-web-evidence.mjs',
        records: mergePerformanceShards(perfShards)
      };
      failures.push(
        ...validatePerformanceArtifact(perfArtifact, {
          budgets,
          entryRoutes
        })
      );
    }
  }

  if (expected === 'a11y' || expected === 'both') {
    if (a11yShards.length === 0) {
      failures.push('期望有 axe 分片卻一個都沒有：掃描 spec 是否被跳過？');
    } else {
      const { scans, evaluatedRuleIds } = mergeA11yShards(a11yShards);
      a11yArtifact = {
        schemaVersion: 1,
        headSha: sha,
        generatedBy: 'scripts/merge-web-evidence.mjs',
        scans
      };
      failures.push(...validateWaivers(waivers, { today }));
      failures.push(
        ...validateA11yArtifact(a11yArtifact, {
          waivers: waivers?.waivers ?? [],
          evaluatedRuleIds,
          expectedScans: expectedA11yScans({ shellRoutes, clinicRoutes })
        })
      );
    }
  }

  return { perfArtifact, a11yArtifact, failures };
}

/** 真實輸入（檔案系統）。匯出以便測試驗證它讀得懂本 repo 的組態。 */
export async function repositoryInputs() {
  const read = (...parts) => readFile(join(root, ...parts), 'utf8');
  const budgets = JSON.parse(
    await read('apps', 'web', 'performance-budget.json')
  );
  const inventory = JSON.parse(await read('apps', 'web', 'public-pages.json'));
  // 只取 manifest 宣告跑 axe 的進入點（/404 不進掃描矩陣）。
  const shellRoutes = inventory.pages
    .filter((page) => page.scans?.includes('axe'))
    .map((page) => page.route);
  const clinicContent = await import(
    new URL('../apps/web/public/clinic-content.js', import.meta.url)
  );
  const waivers = JSON.parse(
    await read('apps', 'web', 'accessibility-waivers.json')
  );
  const shardDir = join(root, ...SHARD_DIR_PARTS);
  let names;
  try {
    names = await readdir(shardDir);
  } catch {
    names = [];
  }
  const perfShards = [];
  const a11yShards = [];
  for (const name of names) {
    const match = SHARD_PATTERN.exec(name);
    if (match === null) continue;
    const shard = JSON.parse(await readFile(join(shardDir, name), 'utf8'));
    if (match[1] === 'performance') perfShards.push(shard);
    else a11yShards.push(shard);
  }
  return {
    budgets,
    shellRoutes,
    clinicRoutes: clinicContent.CLINIC_ROUTES,
    waivers,
    perfShards,
    a11yShards
  };
}

export function parseArgs(argv) {
  const args = { expect: 'both' };
  const values = new Set(['perf', 'a11y', 'both', 'none']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const equals = /^--expect=(.+)$/.exec(token ?? '');
    if (equals !== null) {
      if (values.has(equals[1])) args.expect = equals[1];
      continue;
    }
    if (token === '--expect') {
      const next = argv[index + 1];
      if (next !== undefined && values.has(next)) {
        args.expect = next;
        index += 1;
      }
    }
  }
  return args;
}

async function runCli() {
  const { expect: expected } = parseArgs(process.argv.slice(2));
  if (expected === 'none') {
    console.log('merge-web-evidence: this group produces no web shards, skip.');
    return;
  }
  const sha = headSha();
  const inputs = await repositoryInputs();
  const { perfArtifact, a11yArtifact, failures } = mergeEvidence({
    ...inputs,
    today: utcToday(),
    sha,
    expect: expected
  });
  const dir = join(root, ...EVIDENCE_DIR_PARTS);
  await mkdir(dir, { recursive: true });
  if (perfArtifact !== null) {
    await writeFile(
      join(dir, `web-performance-${sha}.json`),
      `${JSON.stringify(perfArtifact, null, 2)}\n`
    );
  }
  if (a11yArtifact !== null) {
    await writeFile(
      join(dir, `web-accessibility-${sha}.json`),
      `${JSON.stringify(a11yArtifact, null, 2)}\n`
    );
  }
  if (failures.length > 0) {
    console.error('Web evidence merge failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Web evidence merged (perf records: ${perfArtifact?.records?.length ?? 0}, a11y scans: ${a11yArtifact?.scans?.length ?? 0}).`
  );
}

const invokedAsCli =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsCli) {
  await runCli();
}
