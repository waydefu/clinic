import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import process from 'node:process';

const requiredPaths = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  '.env.example',
  'docs/README.md',
  'docs/document-lifecycle.md',
  'docs/enterprise-appointment-project-plan.md',
  'docs/archive/clinic-zerocost-proposal.md',
  'docs/product/open-decisions.md',
  'docs/product/test-only-sandbox-baseline.md',
  'docs/product/test-only-scheduling-follow-up-workbench.md',
  'docs/architecture/domain-boundaries.md',
  'docs/architecture/production-target-architecture-2026-07-23.md',
  'docs/architecture/api-v1-contract.md',
  'docs/architecture/web-quality-gates-2026-07-24.md',
  'docs/architecture/infrastructure-and-operations-plan-2026-07-24.md',
  'docs/architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md',
  'docs/runbooks/manual-accessibility-test.md',
  'docs/runbooks/backup-and-restore.md',
  'docs/runbooks/incident-response.md',
  'docs/architecture/firestore-local-baseline.md',
  'docs/phase-0-local-development.md',
  'docs/phase-1-execution-plan.md',
  'docs/legal/privacy-policy-draft.md',
  'docs/design/test-only-operations-ui.md',
  'docs/legal/phase-1-privacy-approval-packet.md',
  'docs/product/phase-1-decision-register.md',
  'docs/product/current-execution-and-approval-plan.md',
  'docs/product/full-project-master-plan-2026-07-31.md',
  'docs/product/full-project-execution-book-2026-07-31.md',
  'docs/product/owner-requests-consolidated-2026-07-31.md',
  'docs/product/production-readiness-delivery-plan-2026-07-23.md',
  'docs/product/phase-1-chinese-approval-checklist.md',
  'docs/product/phase-1-appointment-operations-approval-packet.md',
  'docs/product/phase-1-case-management-payroll-approval-packet.md',
  'docs/product/phase-1-integration-launch-approval-packet.md',
  'docs/security/privacy-policy-checklist.md',
  'docs/security/taiwan-privacy-legal-baseline.md',
  'docs/payroll/month-close-spec.md',
  'docs/runbooks/calendar-sync-failure.md',
  'docs/architecture/synthetic-web-modular-architecture.md',
  'docs/reviews/manager-workflow-analysis-and-remediation-2026-07-21.md',
  'docs/reviews/codebase-analysis-and-remediation-2026-07-21.md',
  'docs/runbooks/synthetic-online-preview.md',
  'docs/reviews/2026-07-20-implementation-readiness-review.md',
  'docs/reviews/2026-07-23-enterprise-production-readiness-review.md',
  'docs/reviews/2026-07-26-local-operations-rehearsal.md',
  'docs/reviews/stage-0-checkpoint-a-2026-07-24.md',
  'docs/reviews/phase-1-entry-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-approval-gate.md',
  'docs/reviews/phase-1-test-only-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-synthetic-case-workload-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md',
  'docs/adr/0001-domain-api-is-the-only-write-path.md',
  'docs/adr/0003-firestore-direct-client-access-is-deny-by-default.md',
  'docs/adr/0004-browser-and-server-share-one-compiled-domain.md',
  'docs/adr/0005-patient-intake-and-appointment-command-are-separate.md',
  'infra/terraform/README.md',
  'firebase.json',
  'firestore.rules',
  'packages/domain/src/index.ts',
  'packages/domain/src/audit.ts',
  'packages/domain/src/booking-transaction.ts',
  'packages/domain/src/appointment-transition.ts',
  'packages/domain/src/schedule.ts',
  'packages/domain/src/follow-up.ts',
  'packages/domain/src/case-assignment.ts',
  'packages/domain/src/payroll.ts',
  'packages/contracts/src/schedule.ts',
  'packages/contracts/src/follow-ups.ts',
  'packages/contracts/src/case-assignment.ts',
  'packages/contracts/src/payroll.ts',
  'tests/firestore/appointment-transition.test.ts',
  'apps/api/src/firestore/booking.repository.ts',
  'tests/firestore/booking-transaction.test.ts',
  'tests/firestore/local-restore-drill.test.ts',
  'packages/domain/src/outbox.ts',
  'apps/worker/src/calendar-port.ts',
  'apps/worker/src/outbox-processor.ts',
  'apps/worker/src/worker-observability.ts',
  'tests/firestore/outbox-worker.test.ts',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/audit.ts',
  'packages/contracts/src/audit.test.ts',
  'apps/api/src/main.ts',
  'apps/api/src/health.controller.ts',
  'apps/api/src/platform/errors/api-error.ts',
  'apps/api/src/platform/authorization/rbac.ts',
  'apps/api/src/platform/authorization/rbac-appointment-policy.ts',
  'apps/api/src/platform/authorization/rbac-appointment-policy.test.ts',
  'apps/api/src/platform/runtime/maintenance-gate.ts',
  'apps/api/src/platform/runtime/rate-limiter.ts',
  'apps/web/src/calendar-export.test.ts',
  'apps/web/src/security-headers.test.ts',
  'apps/web/public/modules/calendar-export.js',
  'apps/web/public/modules/domain-rules.js',
  'packages/domain/src/appointment-rules.ts',
  'apps/web/public/admin-bootstrap.js',
  'apps/web/public/workbench.css',
  'apps/web/public/patient-app.js',
  'apps/web/public/store.js',
  'apps/web/public/modules/constants.js',
  'apps/web/public/modules/permissions.js',
  'apps/web/public/modules/patient-registry.js',
  'apps/web/public/modules/schedule-engine.js',
  'apps/web/public/modules/appointment-domain.js',
  'apps/web/public/modules/case-management.js',
  'apps/web/public/modules/workspace-domain.js',
  'apps/web/public/modules/state-schema.js',
  'apps/web/public/modules/ui-format.js',
  'apps/web/public/modules/admin-view.js',
  'apps/web/src/test-only-modules.test.ts',
  'apps/web/src/test-only-auth.test.ts',
  'apps/web/package.json',
  'apps/web/server.mjs',
  'apps/web/public/index.html',
  'apps/web/public/patient.html',
  'apps/web/public/clinic.html',
  'apps/web/public/clinic-site.css',
  'apps/web/public/clinic-booking.css',
  'apps/web/public/clinic-site.js',
  'apps/web/public/clinic-content.js',
  'apps/web/public/404.html',
  'scripts/check-web-ui.mjs',
  'scripts/build-web.mjs',
  'scripts/build-brand-assets.mjs',
  'docs/design/boutique-clinical-command-2026-07-25.md',
  'docs/design/clinic-site-integration-2026-07-27.md',
  'apps/web/brand-source/brand-lockup.png',
  'apps/web/brand-source/nhi-mark.png',
  // OG 分享圖同一套做法：未出貨的原始 PNG 留在 brand-source/，出貨的是
  // build:brand 產的 JPEG。少了原圖就無法重新產出，只能拿出貨檔再壓一次。
  'apps/web/brand-source/og-booking.png',
  'apps/web/brand-source/og-booking.metadata.json',
  'apps/web/public/og-booking.jpg',
  'apps/web/public/assets/brand-mark.webp',
  'apps/web/public/assets/nhi-mark.webp',
  // 官網素材與品牌資產同一套做法：未出貨的原圖留在 *-source/，出貨的 WebP 進
  // 版控。manifest 記錄每一張的來源、尺寸與 SHA-256，是 C2 授權確認的對象。
  'scripts/build-clinic-assets.mjs',
  'apps/web/clinic-source/clinic-logo.png',
  'apps/web/clinic-assets.manifest.json',
  'apps/web/public/clinic-assets/clinic-logo.webp',
  'playwright.config.ts',
  'playwright.screenshots.config.ts',
  'tests/ui-screenshots/current-ui.spec.ts',
  'tests/e2e/patient-booking.spec.ts',
  'tests/e2e/clinic-site.spec.ts',
  'tests/e2e/workbench-lifecycle.spec.ts',
  'tests/e2e/accessibility.spec.ts',
  'tests/e2e/performance.spec.ts',
  'tests/e2e/theme.spec.ts',
  'tests/e2e/responsive.spec.ts',
  'apps/web/performance-budget.json',
  'scripts/check-performance-budget.mjs',
  'scripts/check-design-tokens.mjs',
  'scripts/generate-sbom.mjs',
  '.github/workflows/sast.yml',
  '.github/workflows/sast-scan.yml',
  'apps/web/public/styles.css',
  'apps/web/public/error.css',
  'apps/web/public/favicon.svg',
  // 每一支阻斷式檢查與它的測試都要列在這裡。腳本被刪掉會被抓到，測試被刪掉也是
  // ——少了測試的 gate 還會顯示綠燈，那比 gate 消失更難察覺（CONTRIBUTING 第 8 條）。
  'scripts/check-structure.mjs',
  'scripts/check-structure.test.mjs',
  'scripts/check-docs-links.mjs',
  'scripts/check-docs-links.test.mjs',
  'scripts/generate-ci-evidence.mjs',
  'scripts/generate-sast-evidence.mjs',
  'scripts/generate-sast-evidence.test.mjs',
  'scripts/architecture-rules.mjs',
  'scripts/architecture-rules.test.mjs',
  'scripts/unrouted-inventory.test.mjs',
  'scripts/web-ui-rules.mjs',
  'scripts/web-ui-rules.test.mjs',
  'scripts/check-audit-exceptions.mjs',
  'scripts/check-audit-exceptions.test.mjs',
  'security/audit-exceptions.json',
  'scripts/verify-preview-deployment.mjs',
  'scripts/check-tracked-secrets.mjs',
  'scripts/check-tracked-secrets.test.mjs',
  'scripts/check-design-tokens.test.mjs',
  'scripts/check-performance-budget.test.mjs',
  'scripts/check-public-pages.test.mjs',
  'scripts/check-branch-protection.test.mjs',
  'scripts/generate-ci-evidence.test.mjs',
  'scripts/generate-sbom.test.mjs',
  'scripts/sync-domain-vendor.mjs',
  'apps/web/public/vendor/domain/index.js',
  'apps/web/public/vendor/domain/manifest.json',
  'eslint.config.mjs',
  'tsconfig.eslint.json',
  '.github/workflows/verify.yml',
  'scripts/run-firestore-rules.mjs',
  'scripts/run-firestore-vitest.mjs',
  'scripts/cleanup-local-firestore-emulator.ps1',
  // 架構把關：依賴方向、未接線清單、domain 規則單一來源，以及分支保護查核。
  'scripts/check-architecture.mjs',
  'scripts/unrouted-inventory.mjs',
  'scripts/check-branch-protection.mjs',
  'apps/api/unrouted-inventory.json',
  'apps/api/src/unrouted-inventory.test.ts',
  'packages/domain/src/patient-identity.ts',
  'packages/domain/src/patient-identity.test.ts',
  'docs/reviews/2026-07-26-full-project-audit.md',
  // 檢索與收錄：兩份檔案與 patient.html 的 canonical 由 check:ui 綁在一起。
  'apps/web/public/robots.txt',
  'apps/web/public/sitemap.xml',
  'docs/reviews/2026-07-27-seo-baseline.md',
  'docs/reviews/2026-07-27-clinic-site-integration-delivery.md',
  // 現行視覺基線。舊日期的目錄與文件保留作歷史證據，但釘住的是現行那一份；
  // 日期見下方 visualBaselineDirectory 的註解。
  'docs/reviews/2026-08-10-clinic-homepage-restructure.md',
  'docs/reviews/ui-visual-baseline-2026-08-10.md',
  'docs/reviews/assets/ui-visual-baseline-2026-08-10/manifest.json',
  // 個資法第 8 條的告知頁：與 404 一樣自成一頁，無指令碼。
  'apps/web/public/privacy.html',
  'apps/web/public/privacy.css',
  'apps/web/public/modules/policy-dialog.js',
  // 介面規則書：改規則要連同對應的測試一起改，所以它必須是被釘住的檔案。
  'docs/design/ui-ux-rules.md',
  // 對外頁面的單一來源與比對它的守衛（2026-07-27，自動檢查缺口 F-4）。
  'apps/web/public-pages.json',
  'scripts/check-public-pages.mjs',
  'docs/reviews/2026-07-27-automated-check-gaps.md'
];

export { requiredPaths };

// 匯出成純函式，讓這道 gate 自己也能被測試。它決定「刪掉某個把關檔案會不會被
// 發現」，而一個沒有測試的把關檔案清單，本身就是它要防的那種漏洞。
export function findMissingPaths({ paths, isReadable }) {
  return paths.filter((candidate) => !isReadable(candidate));
}

const readable = new Set();
await Promise.all(
  requiredPaths.map(async (requiredPath) => {
    try {
      await access(requiredPath, constants.R_OK);
      readable.add(requiredPath);
    } catch {
      /* absent or unreadable; reported below */
    }
  })
);
const missing = findMissingPaths({
  paths: requiredPaths,
  isReadable: (candidate) => readable.has(candidate)
});

if (missing.length > 0) {
  console.error('Missing required project files:');
  for (const requiredPath of missing) console.error(`- ${requiredPath}`);
  process.exitCode = 1;
} else {
  console.log(
    `Structure check passed (${requiredPaths.length} required files).`
  );
}

// UI 參考圖是 dated evidence，不是跨 OS 的像素 golden；但 manifest、每張圖與其
// metadata 必須一起存在且 hash 相符。否則文件仍有連結、實際證據卻已被換掉或漏掉，
// `check:docs` 只會看到「檔名還在」而無法察覺。
// **這一行是本檔內唯一要改的地方。** 重拍基線時改這裡的日期，required paths 與
// 下面的 captureDate 斷言都由它派生。先前日期各自寫死在三處，2026-08-06 重拍時
// 漏掉其中一處，gate 報「manifest 必須保留擷取日期」——那個訊息聽起來像圖片被
// 竄改，實際上是檢查器自己還停在舊日期。
const visualBaselineDirectory =
  'docs/reviews/assets/ui-visual-baseline-2026-08-10';
const visualBaselineDate = visualBaselineDirectory.slice(-'YYYY-MM-DD'.length);
const visualBaselineErrors = [];
try {
  const manifest = JSON.parse(
    await readFile(`${visualBaselineDirectory}/manifest.json`, 'utf8')
  );
  if (manifest.schemaVersion !== 1)
    visualBaselineErrors.push('visual manifest schemaVersion must be 1');
  if (manifest.sourceRevision !== 'commit-containing-this-manifest')
    visualBaselineErrors.push(
      'visual manifest must use the non-self-referential containing-commit marker'
    );
  if (
    manifest.captureDate !== visualBaselineDate ||
    Number.isNaN(Date.parse(manifest.fixedTime))
  )
    visualBaselineErrors.push(
      'visual manifest must retain its capture date and parseable fixed application time'
    );
  if (manifest.referenceOnly !== true || manifest.crossOsPixelGate !== false)
    visualBaselineErrors.push(
      'visual manifest must identify these images as reference-only, not a cross-OS pixel gate'
    );
  if (
    !Array.isArray(manifest.captureNormalization) ||
    manifest.captureNormalization.length < 2
  )
    visualBaselineErrors.push(
      'visual manifest must disclose full-page capture normalization'
    );
  for (const field of [
    'os.platform',
    'os.release',
    'os.architecture',
    'browser.name',
    'browser.version',
    'playwright',
    'locale',
    'timezone',
    'theme',
    'reducedMotion'
  ]) {
    const value = field
      .split('.')
      .reduce((current, key) => current?.[key], manifest.environment);
    if (typeof value !== 'string' || value.length === 0)
      visualBaselineErrors.push(
        `visual manifest is missing environment field ${field}`
      );
  }
  if (
    manifest.environment?.workers !== 1 ||
    manifest.environment?.serverPort !== 3211
  )
    visualBaselineErrors.push(
      'visual manifest must retain its single-worker local capture environment'
    );
  if (!Array.isArray(manifest.captures) || manifest.captures.length !== 10) {
    visualBaselineErrors.push(
      'visual manifest must declare exactly the ten reviewed current UI captures'
    );
  } else {
    const requiredScenarios = [
      {
        file: 'clinic--home--desktop-1280x900--light.png',
        route: '/clinic',
        role: 'public',
        state: 'default',
        width: 1280,
        height: 900
      },
      {
        file: 'clinic--home--phone-375x812--light.png',
        route: '/clinic',
        role: 'public',
        state: 'default',
        width: 375,
        height: 812
      },
      {
        file: 'booking--step-1--desktop-1280x900--light.png',
        route: '/booking',
        role: 'public',
        state: 'step-1-empty',
        width: 1280,
        height: 900
      },
      {
        file: 'booking--step-3-filled--phone-375x812--light.png',
        route: '/booking',
        role: 'public',
        state: 'step-3-filled-synthetic',
        width: 375,
        height: 812
      },
      {
        file: 'booking--step-3-filled--stress-320x568--light.png',
        route: '/booking',
        role: 'public',
        state: 'step-3-filled-synthetic-low-width-height-stress',
        width: 320,
        height: 568
      },
      {
        file: 'workbench--login--desktop-1280x900--light.png',
        route: '/',
        role: 'unauthenticated',
        state: 'clean-login-gate',
        width: 1280,
        height: 900
      },
      {
        file: 'workbench--appointments-populated--desktop-1280x900--light.png',
        route: '/#appointments-section',
        role: 'admin',
        state: 'one-confirmed-synthetic-appointment',
        width: 1280,
        height: 900
      },
      {
        file: 'workbench--appointments-populated--phone-375x812--light.png',
        route: '/#appointments-section',
        role: 'admin',
        state: 'one-confirmed-synthetic-appointment',
        width: 375,
        height: 812
      },
      {
        file: 'workbench--case-assigned-workload--desktop-1280x900--light.png',
        route: '/#case-section',
        role: 'admin',
        state: 'one-completed-visit-assigned-manager_test_001',
        width: 1280,
        height: 900
      },
      {
        file: 'privacy--draft-notice--phone-375x812--light.png',
        route: '/privacy',
        role: 'public',
        state: 'test-only-draft-notice',
        width: 375,
        height: 812
      }
    ];
    for (const scenario of requiredScenarios) {
      const matchingCapture = manifest.captures.find(
        (capture) =>
          capture.file === scenario.file &&
          capture.route === scenario.route &&
          capture.role === scenario.role &&
          capture.state === scenario.state &&
          capture.viewport?.width === scenario.width &&
          capture.viewport?.height === scenario.height
      );
      if (matchingCapture === undefined)
        visualBaselineErrors.push(
          `visual manifest is missing required scenario ${scenario.file}`
        );
    }

    const declaredFiles = manifest.captures
      .map((capture) => capture.file)
      .sort();
    const actualFiles = (await readdir(visualBaselineDirectory))
      .filter((file) => file.endsWith('.png'))
      .sort();
    if (JSON.stringify(declaredFiles) !== JSON.stringify(actualFiles))
      visualBaselineErrors.push(
        'visual baseline PNG set does not exactly match manifest.captures'
      );

    for (const capture of manifest.captures) {
      if (!/^[a-z0-9][a-z0-9.-]*\.png$/.test(capture.file)) {
        visualBaselineErrors.push(
          `visual capture has an unsafe or non-canonical filename: ${capture.file}`
        );
        continue;
      }
      for (const field of ['route', 'role', 'state', 'captureKind', 'sha256']) {
        if (typeof capture[field] !== 'string' || capture[field].length === 0)
          visualBaselineErrors.push(
            `${capture.file} is missing manifest field ${field}`
          );
      }
      if (
        !Number.isInteger(capture.viewport?.width) ||
        !Number.isInteger(capture.viewport?.height) ||
        capture.deviceScaleFactor !== 1
      )
        visualBaselineErrors.push(
          `${capture.file} has incomplete viewport/DPR metadata`
        );
      if (capture.captureKind !== 'reference-full-page')
        visualBaselineErrors.push(
          `${capture.file} has an unexpected capture kind`
        );
      if (
        capture.consoleCounts?.errors !== 0 ||
        capture.consoleCounts?.warnings !== 0
      )
        visualBaselineErrors.push(
          `${capture.file} was captured with console errors or warnings`
        );

      const bytes = await readFile(
        `${visualBaselineDirectory}/${capture.file}`
      );
      const actualHash = createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== capture.sha256)
        visualBaselineErrors.push(
          `${capture.file} SHA-256 does not match the manifest`
        );
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        visualBaselineErrors.push(`${capture.file} is not a PNG`);
      } else {
        const width = bytes.readUInt32BE(16);
        const height = bytes.readUInt32BE(20);
        if (width !== capture.viewport.width)
          visualBaselineErrors.push(
            `${capture.file} width ${width} does not match its viewport ${capture.viewport.width}`
          );
        if (height < capture.viewport.height)
          visualBaselineErrors.push(
            `${capture.file} is shorter than its declared viewport`
          );
      }
    }
  }
} catch (error) {
  visualBaselineErrors.push(
    `could not validate the UI visual baseline: ${error instanceof Error ? error.message : String(error)}`
  );
}

if (visualBaselineErrors.length > 0) {
  console.error('UI visual baseline evidence check failed:');
  for (const error of visualBaselineErrors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('UI visual baseline evidence check passed (10 reference PNGs).');
}

// 在全新 clone 上，型別感知的 ESLint 需要先有 workspace 的 dist/*.d.ts；順序寫反
// 時 CI 不會壞在 lint，而是壞在一連串看不出原因的型別錯誤。這段規則因此比對的是
// 指令字串本身，並且匯出以便測試。
export const CAPTURE_CONFIG_COMMAND = 'corepack pnpm run check:capture-config';
export const CHECK_TYPES_COMMAND = 'corepack pnpm run check:types';
export const CHECK_LINT_COMMAND = 'corepack pnpm run check:lint';
export const EXPECTED_CAPTURE_CONFIG_SCRIPT =
  'tsc --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --types node playwright.screenshots.config.ts';

export function reviewVerifyOrdering(packageJson) {
  const verifyScript = packageJson.scripts?.verify ?? '';
  const captureConfigIndex = verifyScript.indexOf(CAPTURE_CONFIG_COMMAND);
  const checkTypesIndex = verifyScript.indexOf(CHECK_TYPES_COMMAND);
  const checkLintIndex = verifyScript.indexOf(CHECK_LINT_COMMAND);
  const errors = [];

  if (captureConfigIndex < 0)
    errors.push(`verify must include "${CAPTURE_CONFIG_COMMAND}"`);
  if (checkTypesIndex < 0)
    errors.push(`verify must include "${CHECK_TYPES_COMMAND}"`);
  if (checkLintIndex < 0)
    errors.push(`verify must include "${CHECK_LINT_COMMAND}"`);
  if (
    checkTypesIndex >= 0 &&
    checkLintIndex >= 0 &&
    checkTypesIndex > checkLintIndex
  )
    errors.push(
      'verify must build workspace types before running type-aware ESLint'
    );
  if (packageJson.scripts?.['check:types'] !== 'corepack pnpm run build')
    errors.push(
      'check:types must build the workspace packages that provide dist/*.d.ts'
    );
  if (
    packageJson.scripts?.['check:capture-config'] !==
    EXPECTED_CAPTURE_CONFIG_SCRIPT
  )
    errors.push(
      'check:capture-config must type-check the dedicated Playwright capture config'
    );

  return errors;
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const verifyOrderErrors = reviewVerifyOrdering(packageJson);

if (verifyOrderErrors.length > 0) {
  console.error('Invalid clean-clone verify prerequisites:');
  for (const error of verifyOrderErrors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Clean-clone verify ordering check passed.');
}
