import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeScript = readFileSync(
  new URL('./cal-pilot-runtime-update.ps1', import.meta.url),
  'utf8'
);
const buildImagesScript = readFileSync(
  new URL('./cal-pilot-build-images.ps1', import.meta.url),
  'utf8'
);

const confirmApplyIndex = runtimeScript.indexOf(
  "throw 'Preflight passed; review-only mode made no changes. Re-run with -ConfirmApply for this exact candidate.'"
);
const afterConfirm = runtimeScript.slice(confirmApplyIndex);
const beforeConfirm = runtimeScript.slice(0, confirmApplyIndex);

describe('CAL-PILOT runtime-only update policy', () => {
  it('is review-only unless ConfirmApply is supplied', () => {
    expect(runtimeScript).toContain('[switch]$ConfirmApply');
    expect(runtimeScript).toContain(
      "throw 'Preflight passed; review-only mode made no changes. Re-run with -ConfirmApply for this exact candidate.'"
    );
    expect(confirmApplyIndex).toBeGreaterThan(0);
  });

  it('requires an exact 40-character candidate SHA and does not use caller HEAD as source', () => {
    expect(runtimeScript).toContain(
      '[Parameter(Mandatory = $true)][string]$CandidateSha'
    );
    expect(runtimeScript).toContain('^[a-f0-9]{40}$');
    expect(runtimeScript).toContain('git worktree add --detach');
    expect(runtimeScript).not.toContain(
      '(git rev-parse HEAD).Trim() -ne $CandidateSha'
    );
    expect(runtimeScript).not.toContain(
      '(git rev-parse HEAD).Trim() -ne $ApprovedCommit'
    );
  });

  it('aborts when the authorized baseline drifted', () => {
    expect(runtimeScript).toContain(
      'API baseline drifted from the authorized expected state.'
    );
    expect(runtimeScript).toContain(
      'Worker baseline drifted from the authorized expected state.'
    );
    expect(runtimeScript).toContain(
      'Hosting baseline drifted from the authorized expected state.'
    );
    expect(beforeConfirm).toContain('Assert-Baseline');
  });

  it('rejects an unsupported authDomain and parameterizes the Firebase host', () => {
    expect(runtimeScript).toContain('$AuthDomain');
    expect(runtimeScript).toContain(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN=$AuthDomain'
    );
    expect(runtimeScript).toContain('Unsupported authDomain.');
    expect(runtimeScript).toContain('$projectId.firebaseapp.com');
    expect(beforeConfirm).toContain('Assert-AuthDomain');
  });

  it('cannot run legacy migration or a controlled full resync', () => {
    expect(runtimeScript).not.toContain('migrate-cal-pilot-legacy-candidates');
    expect(runtimeScript).not.toContain('CALENDAR_PILOT_LEGACY_MIGRATION');
    expect(runtimeScript).not.toContain(
      'CALENDAR_PILOT_CONFIRM_LEGACY_MIGRATION'
    );
    expect(runtimeScript).not.toContain('tasks/calendar-sync');
    expect(runtimeScript).not.toContain('activate-cal-pilot');
    expect(runtimeScript).not.toContain('disable-cal-pilot');
    expect(runtimeScript).not.toContain('firestore:rules');
    expect(runtimeScript).not.toContain('firestore:indexes');
  });

  it('leaves Worker traffic untouched unless IncludeWorker is set', () => {
    expect(runtimeScript).toContain('[switch]$IncludeWorker');
    expect(runtimeScript).toContain('if ($IncludeWorker)');
    expect(runtimeScript).toContain(
      'Worker was mutated even though IncludeWorker was not set.'
    );
    const workerDeployCount = (
      runtimeScript.match(/gcloud run deploy cal-pilot-worker/g) ?? []
    ).length;
    expect(workerDeployCount).toBe(1);
    expect(afterConfirm).toContain('gcloud run deploy cal-pilot-worker');
    expect(beforeConfirm).not.toContain('gcloud run deploy cal-pilot-worker');
  });

  it('prints rollback-before state during preflight', () => {
    expect(beforeConfirm).toContain('ROLLBACK_BEFORE_API_REVISION=');
    expect(beforeConfirm).toContain('ROLLBACK_BEFORE_HOSTING_VERSION=');
    expect(beforeConfirm).toContain('ROLLBACK_BEFORE_WORKER_REVISION=');
  });

  it('reuses the repo-owned exact-commit image build primitive', () => {
    expect(runtimeScript).toContain('scripts/cal-pilot-build-images.ps1');
    expect(runtimeScript).toContain('-ConfirmBuild');
    expect(runtimeScript).not.toContain('gcloud builds submit');
    expect(buildImagesScript).toContain('gcloud builds submit');
    expect(buildImagesScript).toContain('_TAG=$Commit');
    expect(afterConfirm).toContain('cal-pilot-build-images.ps1');
    expect(beforeConfirm).not.toContain('-ConfirmBuild');
  });

  it('pins Hosting and Cloud Build to an isolated candidate SHA checkout', () => {
    expect(runtimeScript).toContain('New-IsolatedCandidateSource');
    expect(runtimeScript).toContain(
      'Isolated Hosting/Cloud Build source HEAD does not match the candidate SHA.'
    );
    expect(afterConfirm).toContain('Push-Location $isolatedSourceRoot');
    expect(afterConfirm).toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId'
    );
    expect(beforeConfirm).not.toContain('firebase hosting:channel:deploy');
    expect(runtimeScript).not.toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId --json'
    );
  });

  it('requires CI evidence for the candidate SHA before mutation', () => {
    expect(beforeConfirm).toContain('Assert-CiVerified');
    expect(runtimeScript).toContain('--workflow verify.yml');
    expect(runtimeScript).toContain(
      'Candidate SHA has no successful verify workflow run. Aborting before mutation.'
    );
  });

  it('probes zero-traffic health before switching API traffic', () => {
    const probeIndex = afterConfirm.indexOf('Invoke-ZeroTrafficHealthProbe');
    const trafficIndex = afterConfirm.indexOf(
      'gcloud run services update-traffic cal-pilot-api'
    );
    expect(probeIndex).toBeGreaterThan(0);
    expect(trafficIndex).toBeGreaterThan(probeIndex);
    expect(afterConfirm).toContain('/v1/health');
    expect(afterConfirm).toContain('--no-traffic');
    expect(beforeConfirm).not.toContain('gcloud run deploy cal-pilot-api');
    expect(beforeConfirm).not.toContain('update-traffic');
  });

  it('preserves secret versions and records candidate provenance', () => {
    expect(runtimeScript).toContain('Assert-SecretVersions');
    expect(afterConfirm).toContain('Assert-SecretVersions');
    expect(runtimeScript).toContain('CANDIDATE_SHA=$CandidateSha');
    expect(runtimeScript).toContain('Get-TaggedImage');
    expect(runtimeScript).toContain(
      'Artifact Registry did not return an immutable'
    );
  });

  it('requires PowerShell 7+ and the expected project identity', () => {
    expect(beforeConfirm).toContain('PowerShell 7+ (pwsh) is required.');
    expect(runtimeScript).toContain("projectId = 'beauessence-clinic-staging'");
    expect(runtimeScript).toContain(
      'Cloud Build is not enabled on beauessence-clinic-staging.'
    );
  });
});
