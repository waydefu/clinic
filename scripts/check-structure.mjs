import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import process from 'node:process';

const requiredPaths = [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  '.env.example',
  'docs/README.md',
  'docs/enterprise-appointment-project-plan.md',
  'docs/archive/clinic-zerocost-proposal.md',
  'docs/product/open-decisions.md',
  'docs/product/test-only-sandbox-baseline.md',
  'docs/product/test-only-scheduling-follow-up-workbench.md',
  'docs/architecture/domain-boundaries.md',
  'docs/architecture/api-v1-contract.md',
  'docs/architecture/firestore-local-baseline.md',
  'docs/phase-0-local-development.md',
  'docs/phase-1-execution-plan.md',
  'docs/legal/privacy-policy-draft.md',
  'docs/design/test-only-operations-ui.md',
  'docs/legal/phase-1-privacy-approval-packet.md',
  'docs/product/phase-1-decision-register.md',
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
  'docs/reviews/phase-1-entry-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-approval-gate.md',
  'docs/reviews/phase-1-test-only-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-synthetic-case-workload-checkpoint-2026-07-20.md',
  'docs/reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md',
  'docs/adr/0001-domain-api-is-the-only-write-path.md',
  'docs/adr/0003-firestore-direct-client-access-is-deny-by-default.md',
  'infra/terraform/README.md',
  'firebase.json',
  'firestore.rules',
  'packages/domain/src/index.ts',
  'packages/domain/src/booking-transaction.ts',
  'packages/domain/src/appointment-transition.ts',
  'tests/firestore/appointment-transition.test.ts',
  'apps/api/src/firestore/booking.repository.ts',
  'tests/firestore/booking-transaction.test.ts',
  'packages/domain/src/outbox.ts',
  'apps/worker/src/calendar-port.ts',
  'apps/worker/src/outbox-processor.ts',
  'tests/firestore/outbox-worker.test.ts',
  'packages/contracts/src/index.ts',
  'apps/api/src/main.ts',
  'apps/api/src/health.controller.ts',
  'apps/web/src/calendar-export.test.ts',
  'apps/web/public/modules/calendar-export.js',
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
  'apps/web/package.json',
  'apps/web/server.mjs',
  'apps/web/public/index.html',
  'apps/web/public/patient.html',
  'scripts/check-web-ui.mjs',
  'apps/web/public/styles.css',
  'apps/web/public/favicon.svg',
  'scripts/check-docs-links.mjs',
  'eslint.config.mjs',
  'tsconfig.eslint.json',
  '.github/workflows/verify.yml',
  'scripts/run-firestore-rules.mjs',
  'scripts/run-firestore-vitest.mjs',
  'scripts/cleanup-local-firestore-emulator.ps1'
];

const missing = [];
for (const requiredPath of requiredPaths) {
  try {
    await access(requiredPath, constants.R_OK);
  } catch {
    missing.push(requiredPath);
  }
}

if (missing.length > 0) {
  console.error('Missing required project files:');
  for (const requiredPath of missing) console.error(`- ${requiredPath}`);
  process.exitCode = 1;
} else {
  console.log(
    `Structure check passed (${requiredPaths.length} required files).`
  );
}
