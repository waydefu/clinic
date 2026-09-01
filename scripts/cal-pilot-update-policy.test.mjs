import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const updateScript = readFileSync(
  new URL('./cal-pilot-update.ps1', import.meta.url),
  'utf8'
);
const finalizeScript = readFileSync(
  new URL('./cal-pilot-finalize-update.ps1', import.meta.url),
  'utf8'
);

describe('CAL-PILOT guarded update policy', () => {
  it('resolves the image from the active revision instead of the latest service template', () => {
    expect(updateScript).toContain(
      'gcloud run revisions describe $activeRevisionName'
    );
    expect(updateScript).toContain('$activeRevision.status.imageDigest');
    expect(updateScript).not.toContain(
      'image = [string]$service.spec.template.spec.containers[0].image'
    );
  });

  it('uses the authenticated deployment operator for zero-traffic smoke without changing Run IAM', () => {
    expect(updateScript).toContain(
      '$operatorIdentityToken = (gcloud auth print-identity-token).Trim()'
    );
    expect(updateScript).toContain('"$workerSmokeUrl/health"');
    expect(updateScript).toContain('"$workerServiceUrl/tasks/calendar-sync"');
    expect(updateScript).not.toContain(
      'gcloud run services add-iam-policy-binding'
    );
    expect(updateScript).not.toContain(
      'gcloud run services remove-iam-policy-binding'
    );
    expect(updateScript).not.toContain('gcloud auth activate-service-account');
  });

  it('retains the safe-stop and explicit resume gates', () => {
    expect(updateScript).toContain('[switch]$ResumeSafeStoppedAttempt');
    expect(updateScript).toContain('[switch]$ConfirmApply');
    expect(updateScript).toContain(
      'gcloud scheduler jobs pause cal-pilot-five-minute-sync'
    );
    expect(updateScript).toContain('node scripts/disable-cal-pilot.mjs');
  });

  it('does not parse mixed Hosting deployment output as JSON', () => {
    expect(updateScript).toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId'
    );
    expect(updateScript).not.toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId --json'
    );
    expect(updateScript).toContain('$hostingChannel = Get-HostingChannel');
  });

  it('finalizes only the exact verified post-migration safe-stop state', () => {
    expect(finalizeScript).toContain('[switch]$ConfirmApply');
    expect(finalizeScript).toContain('Assert-SafeStoppedState');
    expect(finalizeScript).toContain('Assert-WorkerInvokerBoundary');
    expect(finalizeScript).toContain(
      "$env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE = 'verify'"
    );
    expect(finalizeScript).toContain('node scripts/activate-cal-pilot.mjs');
    expect(finalizeScript).toContain(
      'gcloud scheduler jobs resume cal-pilot-five-minute-sync'
    );
    expect(finalizeScript).not.toContain(
      'gcloud run services add-iam-policy-binding'
    );
    expect(finalizeScript).not.toContain('firebase hosting:channel:deploy');
  });
});
