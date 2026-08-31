import { glob, readFile } from 'node:fs/promises';
import { sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// E2E 從單一 job 拆成六個之後，多了一個單一 job 不會有的失敗模式：**新增的 spec
// 沒有被分進任何一組，於是不再執行，而 CI 仍然全綠**。漏跑的測試比紅叉危險，因為
// 它看起來像通過。這份清單因此是分組的唯一真實來源——workflow 用 `--files` 從這裡
// 取檔案列表，這個 gate 再反過來驗證三件事對得起來：
//   1. tests/e2e 下每一支 spec 都剛好屬於一組；
//   2. 清單裡的每個檔案都真的存在（改名不會靜靜地少跑一組）；
//   3. verify.yml 的 matrix 組名與這裡一致（不會有 job 跑到空的一組）。
//
// 規則判斷是純函式並且匯出，可以在沒有 repository 的情況下測試：一個無法單獨執行
// 的 gate，就是一個沒有人能證明它還有效的 gate。

export const SPEC_DIRECTORY = 'tests/e2e';

export const WORKFLOW = '.github/workflows/verify.yml';

// 分組依據是「壞掉的時候你會想找誰」，不是檔案大小。組名會直接成為 PR 上的
// check 名稱（`e2e-<group>`），所以它同時是給人看的標籤。
export const E2E_GROUPS = {
  'auth-rbac': [
    'delegated-deletion.spec.ts',
    'role-maintenance-responsive.spec.ts'
  ],
  appointments: [
    'calendar-pilot-correction.spec.ts',
    'week-calendar.spec.ts',
    'workbench-lifecycle.spec.ts'
  ],
  'patient-portal': [
    'clinic-site.spec.ts',
    'patient-booking.spec.ts',
    'privacy-policy.spec.ts'
  ],
  mobile: ['mobile-layout.spec.ts', 'responsive.spec.ts'],
  accessibility: [
    'accessibility.spec.ts',
    'manual-accessibility-preconditions.spec.ts',
    'no-script.spec.ts'
  ],
  // 版面、字體、動態與效能預算：不屬於任何一條業務流程，但拆組時最容易被遺漏。
  ui: [
    'affordance.spec.ts',
    'clinic-motion.spec.ts',
    'performance.spec.ts',
    'theme.spec.ts',
    'typography.spec.ts'
  ]
};

export function filesFor(group, groups = E2E_GROUPS) {
  const files = groups[group];
  if (files === undefined) return null;
  return files.map((file) => `${SPEC_DIRECTORY}/${file}`);
}

// verify.yml 的 matrix 寫成 `group:` 後面接一串 `- <name>`。只讀那一段，不引入
// YAML 相依：這個 gate 需要知道的僅僅是有哪些組真的會被執行。
export function matrixGroupsIn(workflowText) {
  const lines = workflowText.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*group:\s*$/.test(line));
  if (start === -1) return null;

  const groups = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s*-\s*([\w-]+)\s*$/.exec(line);
    if (match === null) break;
    groups.push(match[1]);
  }
  return groups.length === 0 ? null : groups;
}

/**
 * @param specFiles Repository-relative paths of every spec under tests/e2e.
 * @param matrixGroups Group names verify.yml actually runs; `null` when the
 *   matrix could not be found, `undefined` to skip the cross-check.
 */
export function reviewGroups({
  specFiles,
  groups = E2E_GROUPS,
  matrixGroups
} = {}) {
  const failures = [];
  const assigned = new Map();

  for (const [group, files] of Object.entries(groups))
    for (const file of files) {
      const path = `${SPEC_DIRECTORY}/${file}`;
      const owner = assigned.get(path);
      if (owner === undefined) assigned.set(path, group);
      else
        failures.push(`Spec is in two groups (${owner} and ${group}): ${path}`);
    }

  const present = new Set(specFiles);

  for (const [path, group] of assigned)
    if (!present.has(path))
      failures.push(`Group ${group} lists a spec that does not exist: ${path}`);

  for (const path of present)
    if (!assigned.has(path))
      failures.push(
        `Spec belongs to no E2E group and would never run: ${path}`
      );

  if (matrixGroups === null)
    failures.push(`Could not read the E2E matrix from ${WORKFLOW}`);
  else if (matrixGroups !== undefined) {
    const defined = Object.keys(groups);
    for (const group of matrixGroups)
      if (!defined.includes(group))
        failures.push(
          `${WORKFLOW} runs a group that is not defined here: ${group}`
        );
    for (const group of defined)
      if (!matrixGroups.includes(group))
        failures.push(
          `Group is defined here but ${WORKFLOW} never runs it: ${group}`
        );
  }

  return failures;
}

async function main() {
  // `--files <group>`：workflow 用這個取得該組的 spec 路徑。
  const requested = process.argv.indexOf('--files');
  if (requested !== -1) {
    const group = process.argv[requested + 1];
    const files = filesFor(group);
    if (files === null) {
      console.error(
        `Unknown E2E group: ${group}. Known groups: ${Object.keys(
          E2E_GROUPS
        ).join(', ')}.`
      );
      process.exitCode = 1;
      return;
    }
    console.log(files.join(' '));
    return;
  }

  const specFiles = [];
  for await (const entry of glob(`${SPEC_DIRECTORY}/**/*.spec.ts`, {
    cwd: process.cwd()
  }))
    specFiles.push(entry.split(sep).join('/'));

  const failures = reviewGroups({
    specFiles,
    matrixGroups: matrixGroupsIn(await readFile(WORKFLOW, 'utf8'))
  });

  if (failures.length > 0) {
    console.error('E2E group check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      `E2E group check passed (${specFiles.length} specs across ${
        Object.keys(E2E_GROUPS).length
      } groups).`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
