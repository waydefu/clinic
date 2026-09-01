import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const updateScript = readFileSync(
  new URL('./cal-pilot-update.ps1', import.meta.url),
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
});
