import { readFile } from 'node:fs/promises';
import process from 'node:process';

const paths = {
  fallbackHtml: 'apps/web/public/index.html',
  adminShell: 'apps/web/public/admin-shell.html',
  adminClient: 'apps/web/public/admin-bootstrap.js',
  patientHtml: 'apps/web/public/patient.html',
  patientClient: 'apps/web/public/patient-app-v2.js',
  store: 'apps/web/public/staging-store-v2.js',
  adminView: 'apps/web/public/modules/admin-view.js',
  schedule: 'apps/web/public/modules/schedule-engine.js',
  cases: 'apps/web/public/modules/case-management.js',
  permissions: 'apps/web/public/modules/permissions.js',
  css: 'apps/web/public/admin-v2.css'
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
  files.fallbackHtml,
  'LOCAL TEST ONLY',
  'Fallback page is missing the local-test label.'
);
requireText(
  files.fallbackHtml,
  '127.0.0.1',
  'Fallback page is missing the loopback boundary.'
);
requireText(
  files.fallbackHtml,
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
  "import { stagingRequest } from './staging-store-v2.js'",
  'Admin client does not use the modular store.'
);
requireText(
  files.adminClient,
  "elements['main-content'].focus({preventScroll:true});",
  'Skip navigation does not move keyboard focus.'
);
requireText(
  files.patientHtml,
  'src="/patient-app-v2.js"',
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
  'audit-filter'
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
  'synthetic-confirmation'
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
requireText(
  files.adminView,
  'maskNationalId',
  'Workbench must render masked national IDs.'
);
const combinedClient = `${files.adminClient}\n${files.patientClient}\n${files.store}\n${files.schedule}\n${files.cases}`;
const externalUrls = combinedClient.match(/https?:\/\/[^'"\s`]+/g) ?? [];
for (const url of externalUrls)
  failures.push(`Unexpected external client endpoint: ${url}`);

if (failures.length > 0) {
  console.error('Modular test-only UI guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    'Modular test-only UI guard passed (permissions, published schedule, case flow, safety and accessibility).'
  );
}
