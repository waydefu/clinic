import { readFile } from 'node:fs/promises';
import process from 'node:process';

// 工作臺的標記自 2026-07-21 起直接寫在 index.html，不再有獨立的 shell 檔。
const paths = {
  adminShell: 'apps/web/public/index.html',
  adminClient: 'apps/web/public/admin-bootstrap.js',
  patientHtml: 'apps/web/public/patient.html',
  patientClient: 'apps/web/public/patient-app.js',
  store: 'apps/web/public/store.js',
  domainRules: 'apps/web/public/modules/domain-rules.js',
  adminView: 'apps/web/public/modules/admin-view.js',
  schedule: 'apps/web/public/modules/schedule-engine.js',
  cases: 'apps/web/public/modules/case-management.js',
  permissions: 'apps/web/public/modules/permissions.js',
  confirmDialog: 'apps/web/public/modules/confirm-dialog.js',
  theme: 'apps/web/public/theme.js',
  css: 'apps/web/public/workbench.css'
};
const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [
    key,
    await readFile(path, 'utf8')
  ])
);
const files = Object.fromEntries(entries);
const failures = [];
// Compare with whitespace removed. These assertions describe which construct
// must exist, not how it is laid out; matching raw text would pin the sources
// to one exact formatting and make them impossible to run a formatter over.
const normalize = (value) => value.replace(/\s+/g, '');
function requireText(source, text, description) {
  if (!normalize(source).includes(normalize(text))) failures.push(description);
}

requireText(
  files.adminShell,
  'id="environment-label"',
  'Workbench no longer states which environment it is running in.'
);
requireText(
  files.adminShell,
  '127.0.0.1',
  'Workbench is missing the loopback boundary notice.'
);
requireText(
  files.adminShell,
  'src="/admin-bootstrap.js"',
  'Root page does not load the modular admin bootstrap.'
);
requireText(
  files.adminShell,
  'href="#main-content"',
  'Admin shell is missing skip navigation.'
);
requireText(
  files.adminShell,
  'id="workspace-account"',
  'Admin shell is missing account-based session selection.'
);
requireText(
  files.adminShell,
  '排班草稿與發布',
  'Admin shell is missing schedule draft/publish workflow.'
);
requireText(
  files.adminShell,
  '逐筆回診確認',
  'Admin shell is missing per-appointment follow-up decisions.'
);
requireText(
  files.adminShell,
  '個案指派與月度工作量',
  'Admin shell is missing case assignment workflow.'
);
requireText(
  files.adminShell,
  'maintenance-starts-at',
  'Admin shell is missing scheduled maintenance start.'
);
requireText(
  files.adminClient,
  "import { stagingRequest } from './store.js'",
  'Admin client does not use the modular store.'
);
requireText(
  files.adminClient,
  "elements['main-content'].focus({preventScroll:true});",
  'Skip navigation does not move keyboard focus.'
);
requireText(
  files.patientHtml,
  'src="/patient-app.js"',
  'Patient page does not load the modular client.'
);
requireText(
  files.patientClient,
  'latestFollowUp()',
  'Patient flow is not linked to a per-patient follow-up decision.'
);
requireText(
  files.store,
  "path==='/schedule/publish'",
  'Store is missing schedule publishing.'
);
requireText(
  files.store,
  "path==='/case-assignments'",
  'Store is missing case-manager assignment.'
);
requireText(
  files.schedule,
  'scheduleImpact',
  'Schedule engine is missing active-booking impact checks.'
);
requireText(
  files.cases,
  'uniquePatientCount',
  'Case module is missing distinct-patient workload.'
);
requireText(
  files.permissions,
  'requirePermission',
  'Permission module is missing action enforcement.'
);
requireText(
  files.css,
  '.workspace-nav',
  'Admin navigation styling is missing.'
);
requireText(
  files.css,
  ':focus-visible',
  'Modular admin CSS must preserve visible focus.'
);

// 2026-07-21 決定（專案負責人）：預約流程改為收集姓名、電話、生日與身分證，
// 公開預覽一併更新。因此這裡不再是「不得有任何輸入欄位」，而是「只允許清單內
// 的欄位」——新增任何欄位都必須是刻意的決定，並回頭確認 D-001～D-003。
const allowedControls = new Set([
  'workspace-account',
  'booking-name',
  'booking-phone',
  'booking-birth',
  'booking-national-id',
  'booking-nhi-card',
  'booking-kind',
  'booking-item',
  'booking-note',
  'slot-kind-filter',
  'appointment-status-filter',
  'appointment-kind-filter',
  'appointment-patient-filter',
  // 2026-07-23：只在已載入的清單內篩選姓名、電話或預約編號，不新增保存欄位。
  'appointment-search',
  'blocked-initial',
  'blocked-follow-up',
  'weekday-0',
  'weekday-1',
  'weekday-2',
  'weekday-3',
  'weekday-4',
  'weekday-5',
  'weekday-6',
  'weekly-start',
  'weekly-end',
  'exception-date',
  'exception-kind',
  'exception-start',
  'exception-end',
  'account-label',
  'account-role',
  'announcement-status',
  'announcement-title',
  'maintenance-enabled',
  'maintenance-title',
  'maintenance-starts-at',
  'maintenance-resume-at',
  'release-version',
  'audit-filter',
  // 2026-07-22：顯示主題切換（自動／淺色／護眼／深色），不觸碰任何資料。
  'theme-picker',
  // 2026-07-23：日曆投影死信補回的合成示範，不觸碰任何病患資料。
  'outbox-fail-next'
]);
for (const control of files.adminShell.matchAll(
  /<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedControls.has(control[1]))
    failures.push(`Unexpected modular admin input: ${control[1]}.`);
}
const allowedTextareas = new Set([
  'announcement-body',
  'maintenance-body',
  'release-summary'
]);
for (const control of files.adminShell.matchAll(
  /<textarea\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedTextareas.has(control[1]))
    failures.push(`Unexpected modular admin textarea: ${control[1]}.`);
}
const allowedPatientControls = new Set([
  'patient-name',
  'patient-phone',
  'patient-birth',
  'patient-national-id',
  'patient-nhi-card',
  'synthetic-confirmation',
  // 2026-07-22：顯示主題切換（自動／淺色／護眼／深色），不觸碰任何資料。
  'theme-picker',
  // 2026-07-23：時段清單的日期跳轉，只是檢視用篩選，不收集任何患者資料。
  'patient-slot-date'
]);
for (const control of files.patientHtml.matchAll(
  /<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/gi
)) {
  if (!allowedPatientControls.has(control[1]))
    failures.push(`Unexpected patient data input: ${control[1]}.`);
}
// The patient page must keep telling visitors where their data goes, and the
// list must never render an unmasked national ID.
requireText(
  files.patientHtml,
  '只會保存在我這台裝置的瀏覽器',
  'Patient form no longer states where the data is stored.'
);
const localOnlyLinks =
  files.patientHtml.match(/\bdata-local-only-link\b/g)?.length ?? 0;
if (localOnlyLinks !== 2)
  failures.push(
    'Patient header and footer must both mark their workbench links as local-only.'
  );
requireText(
  files.patientClient,
  "document.querySelectorAll('[data-local-only-link]')",
  'Online patient preview no longer hides every internal workbench link.'
);
requireText(
  files.adminView,
  'maskNationalId',
  'Workbench must render masked national IDs.'
);
const combinedClient = `${files.adminClient}\n${files.patientClient}\n${files.store}\n${files.domainRules}\n${files.schedule}\n${files.cases}\n${files.confirmDialog}\n${files.theme}`;
const externalUrls = combinedClient.match(/https?:\/\/[^'"\s`]+/g) ?? [];
for (const url of externalUrls)
  failures.push(`Unexpected external client endpoint: ${url}`);
// 2026-07-22 基線：確認一律走自製 <dialog> 彈窗（焦點陷阱、主題一致），
// 不得退回無樣式且無法自訂的 window.confirm。
if (/window\.confirm/.test(combinedClient))
  failures.push('window.confirm is banned; use modules/confirm-dialog.js.');
for (const key of ['adminClient', 'patientClient'])
  requireText(
    files[key],
    "from './modules/confirm-dialog.js'",
    `${key} must use the shared confirm dialog.`
  );

if (failures.length > 0) {
  console.error('Modular test-only UI guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Modular test-only UI guard passed (permissions, published schedule, case flow, safety and accessibility).'
  );
}
