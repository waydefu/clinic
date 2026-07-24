import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 產生 **CycloneDX 1.6** 的 SBOM，並對授權政策把關。
//
// 這取代先前 CI 的 `pnpm list --json > dependency-inventory.json`：那份清單只有
// 我們自己看得懂，餵不進任何漏洞比對或授權稽核工具。CycloneDX 是 OWASP 的開放
// 標準，每個元件都帶 purl（package URL），是掃描器與主管機關都認得的格式。
//
// 為什麼自己產而不是裝一個產生器：這個 workspace 是 pnpm，主流的 npm 產生器對
// pnpm 的 virtual store 支援不一；而 `pnpm list --json` 已經給出完整的安裝結果，
// 轉檔是純資料轉換。少一個供應鏈相依，本身就是供應鏈治理的一部分。
//
// **已知限制（刻意記錄，不假裝沒有）**：`pnpm list` 對重複出現的子樹會標
// `deduped` 並省略其相依，因此 `dependencies` 邊集合取所有 workspace 專案的
// 聯集——元件清單是完整的，相依圖則可能缺少少數邊。漏洞比對與授權稽核靠的是
// 元件與 purl，不受此限制影響；若之後需要完整相依圖，來源要改成 lockfile。

// 授權政策：允許的是寬鬆授權。強 copyleft（GPL/AGPL）會把義務傳染給我們自己的
// 程式，未經法務判斷不得進入相依樹；未知授權同樣必須有人看過才算數。
const ALLOWED_LICENSES = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL'
]);

// 已審視的例外：manifest 的授權欄位不是合法 SPDX 識別碼（或根本沒填），但套件
// 本身是開發相依、不會出貨到患者或診所的執行環境。列在這裡的每一筆都會在每次
// 執行時印出來，維持可見；正式上線前的法務簽核仍要逐筆確認（D-010 證據包）。
//
// **鍵是完整 purl（含版本），不是套件名稱。** 只用名稱查找的話，套件升到新版本
// 時例外會自動延續——但被審視過的是舊版本的授權內容，新版本可能換了授權、也可能
// 從 dev 相依變成 runtime 相依。那正是稽核最需要重新看一眼的時刻，卻會被靜靜放行。
// 每一筆同時釘住預期的授權字串與預期的 scope：任何一項漂移就重新失敗，等待審視。
const REVIEWED_EXCEPTIONS = new Map([
  [
    'pkg:npm/deep-freeze@0.0.1',
    {
      license: 'public domain',
      scope: 'optional',
      note: 'manifest 寫 "public domain"，非 SPDX 識別碼；dev-only'
    }
  ],
  [
    'pkg:npm/url-template@2.0.8',
    {
      license: 'BSD',
      scope: 'optional',
      note: 'manifest 寫 "BSD"，未指明第幾條款；dev-only（firebase-tools）'
    }
  ],
  [
    'pkg:npm/valid-url@1.0.9',
    {
      license: '(未標示)',
      scope: 'optional',
      note: 'manifest 沒有 license 欄位；dev-only（firebase-tools）'
    }
  ]
]);

/**
 * 評估 SPDX 授權運算式：`OR` 只要有一邊可接受就通過，`AND` 必須兩邊都通過，
 * `WITH` 的例外條款看主授權。把整串運算式塞進允許清單是錯的做法——
 * `(MIT OR CC0-1.0)` 明明兩邊都可接受，卻會因為字串不相等而被擋下。
 */
export function isLicenseAllowed(expression, allowed) {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;
  let malformed = false;

  const parseAtom = () => {
    const token = tokens[position];
    position += 1;
    if (token === '(') {
      const value = parseOr();
      if (tokens[position] === ')') position += 1;
      else malformed = true;
      return value;
    }
    if (tokens[position]?.toUpperCase() === 'WITH') position += 2;
    return token !== undefined && allowed.has(token);
  };

  const parseAnd = () => {
    let value = parseAtom();
    while (tokens[position]?.toUpperCase() === 'AND') {
      position += 1;
      value = parseAtom() && value;
    }
    return value;
  };

  function parseOr() {
    let value = parseAnd();
    while (tokens[position]?.toUpperCase() === 'OR') {
      position += 1;
      value = parseAnd() || value;
    }
    return value;
  }

  const allowedByExpression = parseOr();
  // 解析不完整（有剩下的 token、或括號沒收掉）代表這不是我們看得懂的運算式，
  // 一律視為不通過——看不懂就不能當作通過。
  return !malformed && position === tokens.length && allowedByExpression;
}

/** purl 規格：scope 當 namespace，`@` 要百分比編碼。 */
export function packageUrl(name, version) {
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    const scope = name.slice(0, slash);
    const bare = name.slice(slash + 1);
    return `pkg:npm/${encodeURIComponent(scope)}/${bare}@${version}`;
  }
  return `pkg:npm/${name}@${version}`;
}

function licenseEntries(expression) {
  if (typeof expression !== 'string' || expression.length === 0) return [];
  // 單一 SPDX 識別碼用 `license.id`；複合式（OR/AND/WITH）依規格用
  // `license.expression`，不要硬塞進 id。
  return /[\s()]/.test(expression)
    ? [{ expression }]
    : [{ license: { id: expression } }];
}

/**
 * 純核心：把 `pnpm list --recursive --depth Infinity --json` 的森林轉成
 * CycloneDX 1.6 文件。沒有 I/O：授權從注入的 `licenseOf(path)` 取得，
 * 時間戳與序號由呼叫端決定，因此輸出是可重現的。
 */
export function planSbom(
  projects,
  { inspectPackage, timestamp, serialNumber, toolVersion = '1' }
) {
  const workspaceNames = new Set(projects.map((project) => project.name));
  // ref → { name, version, path, runtime }
  const components = new Map();
  const edges = new Map();

  const addEdge = (fromRef, toRef) => {
    if (!edges.has(fromRef)) edges.set(fromRef, new Set());
    edges.get(fromRef).add(toRef);
  };

  const visit = (node, name, runtime, parentRef) => {
    // workspace 內部的 link: 相依不是外部元件，它自己已經是 workspace 專案。
    if (typeof node.version === 'string' && node.version.startsWith('link:')) {
      addEdge(parentRef, packageUrl(name, versionOfWorkspace(projects, name)));
      return;
    }
    const ref = packageUrl(name, node.version);
    addEdge(parentRef, ref);

    const existing = components.get(ref);
    if (existing === undefined) {
      components.set(ref, {
        name,
        version: node.version,
        path: node.path,
        runtime
      });
    } else if (runtime) {
      // 同一個套件同時被 runtime 與 dev 路徑用到時，runtime 較嚴格者勝出。
      existing.runtime = true;
    } else if (edges.has(ref)) {
      return;
    }

    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      visit(child, childName, runtime, ref);
    }
  };

  const rootProject = projects.find((project) => !project.name.startsWith('@'));
  const rootRef = packageUrl(rootProject.name, rootProject.version);

  for (const project of projects) {
    const projectRef = packageUrl(project.name, project.version);
    if (project !== rootProject) addEdge(rootRef, projectRef);
    if (!edges.has(projectRef)) edges.set(projectRef, new Set());
    for (const [name, node] of Object.entries(project.dependencies ?? {})) {
      visit(node, name, true, projectRef);
    }
    for (const [name, node] of Object.entries(project.devDependencies ?? {})) {
      visit(node, name, false, projectRef);
    }
  }

  const workspaceComponents = projects
    .filter((project) => project !== rootProject)
    .map((project) => ({
      type: 'library',
      'bom-ref': packageUrl(project.name, project.version),
      name: project.name,
      version: project.version,
      purl: packageUrl(project.name, project.version),
      scope: 'required',
      properties: [
        { name: 'beauessence:origin', value: 'workspace' },
        { name: 'beauessence:dependency-scope', value: 'runtime' }
      ]
    }));

  const externalComponents = [...components.entries()]
    .filter(([, component]) => !workspaceNames.has(component.name))
    .map(([ref, component]) => {
      const inspected = inspectPackage(component.path);
      return {
        type: 'library',
        'bom-ref': ref,
        name: component.name,
        version: component.version,
        purl: ref,
        scope: component.runtime ? 'required' : 'optional',
        licenses: licenseEntries(inspected.license),
        properties: [
          { name: 'beauessence:origin', value: 'registry' },
          {
            name: 'beauessence:dependency-scope',
            value: component.runtime ? 'runtime' : 'development'
          },
          {
            name: 'beauessence:resolution',
            // 別的作業系統的 optional binary（esbuild/rollup/fsevents 之類）
            // 在本平台不會被安裝，因此也讀不到 manifest。它們仍列入 SBOM
            // ——鎖檔會解析到它們——但本平台既沒有安裝也不會出貨。
            value: inspected.installed ? 'installed' : 'not-installed'
          }
        ]
      };
    });

  const allComponents = [...workspaceComponents, ...externalComponents].sort(
    (left, right) => left['bom-ref'].localeCompare(right['bom-ref'])
  );

  const dependencies = [...edges.entries()]
    .map(([ref, dependsOn]) => ({
      ref,
      dependsOn: [...dependsOn].sort()
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref));

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber,
    version: 1,
    metadata: {
      timestamp,
      tools: {
        components: [
          {
            type: 'application',
            name: 'beauessence-sbom-generator',
            version: toolVersion
          }
        ]
      },
      component: {
        type: 'application',
        'bom-ref': rootRef,
        name: rootProject.name,
        version: rootProject.version,
        purl: rootRef
      }
    },
    components: allComponents,
    dependencies
  };
}

function versionOfWorkspace(projects, name) {
  return projects.find((project) => project.name === name)?.version ?? '0.0.0';
}

function propertyOf(component, name) {
  return component.properties?.find((property) => property.name === name)
    ?.value;
}

/**
 * 授權政策把關：回傳違反政策的元件與已審視的例外。未知授權一律列出——
 * 「查不到」不等於「沒問題」，必須有人看過才算數。
 */
export function planLicenseReview(
  document,
  { allowed = ALLOWED_LICENSES, exceptions = REVIEWED_EXCEPTIONS } = {}
) {
  const violations = [];
  const accepted = [];

  for (const component of document.components) {
    if (propertyOf(component, 'beauessence:origin') === 'workspace') continue;
    // 本平台沒有安裝的 optional binary 無從檢查，也不會出貨；記在 SBOM 裡即可。
    if (propertyOf(component, 'beauessence:resolution') === 'not-installed') {
      continue;
    }

    const licenses = component.licenses ?? [];
    const identifier =
      licenses.length === 0
        ? '(未標示)'
        : (licenses[0].license?.id ?? licenses[0].expression);
    if (licenses.length > 0 && isLicenseAllowed(identifier, allowed)) continue;

    const exception = exceptions.get(component.purl);
    if (exception !== undefined) {
      // 例外只在「當初被審視的那個版本、那個授權字串、那個 scope」成立。
      const drift = [];
      if (exception.license !== identifier) {
        drift.push(`授權由 ${exception.license} 變成 ${identifier}`);
      }
      if (exception.scope !== component.scope) {
        drift.push(`scope 由 ${exception.scope} 變成 ${component.scope}`);
      }
      if (drift.length === 0) {
        accepted.push({
          purl: component.purl,
          license: identifier,
          exception: exception.note
        });
        continue;
      }
      violations.push({
        purl: component.purl,
        license: identifier,
        scope: component.scope,
        reason: `已審視的例外已漂移（${drift.join('；')}），需重新審視`
      });
      continue;
    }
    violations.push({
      purl: component.purl,
      license: identifier,
      scope: component.scope,
      reason: '不在允許清單，也沒有已審視的例外'
    });
  }

  return { violations, accepted };
}

function inspectInstalledPackage(packagePath) {
  if (typeof packagePath !== 'string') return { license: '', installed: false };
  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(join(packagePath, 'package.json'), 'utf8')
    );
  } catch {
    return { license: '', installed: false };
  }
  if (typeof manifest.license === 'string') {
    return { license: manifest.license, installed: true };
  }
  if (typeof manifest.license?.type === 'string') {
    return { license: manifest.license.type, installed: true };
  }
  if (Array.isArray(manifest.licenses)) {
    return {
      license: manifest.licenses
        .map((entry) => entry.type)
        .filter(Boolean)
        .join(' OR '),
      installed: true
    };
  }
  // 裝了，但沒宣告授權——這才是真的要有人去看的情況。
  return { license: '', installed: true };
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const outputPath = join(repoRoot, 'sbom.cdx.json');

  // Windows 的 Node 無法直接 spawn `.cmd`，因此優先走 package manager 的 JS
  // 進入點（跑在 pnpm 生命週期裡時一定有），其餘情況才回退到 shell。
  const npmExecPath = process.env['npm_execpath'];
  const listArguments = [
    'list',
    '--recursive',
    '--depth',
    'Infinity',
    '--json'
  ];
  const options = {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  };
  const listed =
    npmExecPath === undefined
      ? execFileSync('pnpm', listArguments, {
          ...options,
          shell: process.platform === 'win32'
        })
      : execFileSync(
          process.execPath,
          [npmExecPath, ...listArguments],
          options
        );
  const projects = JSON.parse(listed);

  // 序號必須穩定：同樣的相依樹要產生同樣的 SBOM，否則每次 CI 都是一份「新」
  // 文件，diff 不出到底哪個元件變了。時間戳仍記錄產生時間。
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(projects))
    .digest('hex');
  const serialNumber = `urn:uuid:${fingerprint.slice(0, 8)}-${fingerprint.slice(8, 12)}-4${fingerprint.slice(13, 16)}-a${fingerprint.slice(17, 20)}-${fingerprint.slice(20, 32)}`;

  const document = planSbom(projects, {
    inspectPackage: inspectInstalledPackage,
    timestamp: new Date().toISOString(),
    serialNumber
  });

  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const { violations, accepted } = planLicenseReview(document);
  const runtimeCount = document.components.filter(
    (component) => component.scope === 'required'
  ).length;
  console.log(
    `Wrote sbom.cdx.json (CycloneDX 1.6, ${document.components.length} components, ${runtimeCount} runtime).`
  );

  // 例外每次都印出來，才不會靜靜地長期存在。
  for (const entry of accepted) {
    console.log(
      `- 已審視例外 ${entry.purl}: ${entry.license} — ${entry.exception}`
    );
  }

  if (violations.length > 0) {
    console.error('License policy check failed:');
    for (const violation of violations) {
      console.error(
        `- ${violation.purl}: ${violation.license} (scope: ${violation.scope}) — ${violation.reason}`
      );
    }
    console.error(
      '允許清單與已審視例外都在 scripts/generate-sbom.mjs。新增任何一項都必須是' +
        '一次刻意的決定，強 copyleft 需法務判斷。'
    );
    process.exitCode = 1;
  } else {
    console.log(
      `License policy check passed (${accepted.length} 筆已審視例外).`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
