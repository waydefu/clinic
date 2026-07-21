import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  client: 'apps/web/public/app.js',
  css: 'apps/web/public/styles.css',
  html: 'apps/web/public/index.html',
  patientClient: 'apps/web/public/patient.js',
  patientHtml: 'apps/web/public/patient.html',
  stagingStore: 'apps/web/public/staging-store.js'
};

const [client, css, html, patientClient, patientHtml, stagingStore] = await Promise.all(
  Object.values(files).map((file) => readFile(file, 'utf8'))
);

const failures = [];

function requireText(source, text, description) {
  if (!source.includes(text)) failures.push(description);
}

requireText(html, 'LOCAL TEST ONLY', 'Missing visible local-test environment label.');
requireText(html, '127.0.0.1', 'Missing visible loopback-only boundary.');
requireText(html, 'href="#main-content"', 'Missing keyboard skip navigation link.');
requireText(html, '<main id="main-content" class="dashboard" tabindex="-1">', 'Missing focusable skip-navigation target.');
requireText(html, 'id="booking-flow"', 'Missing first workflow landmark.');
requireText(html, 'href="/patient.html"', 'Missing synthetic patient-page navigation.');
requireText(html, 'ROLE SIMULATOR', 'Missing admin/front-desk role simulator.');
requireText(html, '公告、發布與維護模式', 'Missing release and maintenance controls.');
requireText(html, 'role="status"', 'Missing live status region.');
requireText(html, 'aria-live="polite"', 'Missing polite live updates for dynamic content.');
requireText(client, "const apiBaseUrl = 'http://127.0.0.1:3000/v1/test-only'", 'Client API base URL is not fixed to loopback test-only API.');
requireText(client, "elements.mainContent.focus({ preventScroll: true });", 'Skip navigation does not transfer keyboard focus to main content.');
requireText(client, 'data-action="reserve"', 'Missing synthetic reservation action markup.');
requireText(client, 'data-action="complete"', 'Missing synthetic completion action markup.');
requireText(client, 'SYNTHETIC FOLLOW-UP DECISION', 'Missing synthetic follow-up safety state.');
requireText(client, 'ONLINE SYNTHETIC PREVIEW', 'Missing online synthetic preview label.');
requireText(stagingStore, "const storageKey = 'beauessence_synthetic_online_preview_v1'", 'Missing isolated browser-only preview store.');
requireText(patientHtml, 'data-booking-step="1"', 'Missing enterprise patient booking step flow.');
requireText(patientHtml, 'id="patient-maintenance"', 'Missing patient maintenance-state experience.');
requireText(css, '.skip-link', 'Missing skip-navigation visual treatment.');
requireText(css, ':focus-visible', 'Missing keyboard focus-visible treatment.');

const allowedControls = new Set([
  'weekly-start', 'weekly-end', 'exception-date',
  'exception-kind', 'exception-start', 'exception-end', 'follow-up-status',
  'follow-up-date', 'workspace-role', 'weekday-0', 'weekday-1', 'weekday-2',
  'weekday-3', 'weekday-4', 'weekday-5', 'weekday-6', 'account-label',
  'account-role', 'announcement-status', 'announcement-title',
  'maintenance-enabled', 'maintenance-title', 'maintenance-resume-at',
  'release-version'
]);
for (const control of html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
  if (!allowedControls.has(control[1])) failures.push(`Unexpected test-only input control: ${control[1]}.`);
}
const allowedTextareas = new Set(['announcement-body', 'maintenance-body', 'release-summary']);
for (const control of html.matchAll(/<textarea\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
  if (!allowedTextareas.has(control[1])) failures.push(`Unexpected test-only free-text control: ${control[1]}.`);
}
for (const control of patientHtml.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/gi)) {
  if (control[1] !== 'synthetic-confirmation') failures.push(`Unexpected patient data input control: ${control[1]}.`);
}

if (!patientHtml.includes('LOCAL TEST ONLY') || !patientHtml.includes('127.0.0.1')) {
  failures.push('Synthetic patient page is missing visible local-only boundaries.');
}

const externalUrls = `${client}\n${patientClient}\n${stagingStore}`.match(/https?:\/\/[^'"\s`]+/g) ?? [];
for (const url of externalUrls) {
  if (url !== 'http://127.0.0.1:3000/v1/test-only') {
    failures.push(`Unexpected non-loopback client endpoint: ${url}`);
  }
}

if (failures.length > 0) {
  console.error('Test-only UI guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Test-only UI guard passed (safety, landmarks, live updates and focus checks).');
}
