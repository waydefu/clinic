import { describe, expect, it } from 'vitest';

import {
  WP_B6_HISTORICAL_ARTIFACTS,
  evaluateHistoricalArtifacts
} from './historical-artifacts.mjs';

describe('historical artifacts', () => {
  it('records twelve WP-B6 hashes and treats absence as lost, not as a new original', () => {
    expect(WP_B6_HISTORICAL_ARTIFACTS).toHaveLength(12);
    const lost = evaluateHistoricalArtifacts({
      searchRoots: ['/missing'],
      listFiles: () => [],
      hashFile: () => 'deadbeef'
    });
    expect(lost.status).toBe('HISTORICAL_ARTIFACTS_LOST');
    expect(lost.newEvidenceSet).toBe(true);
    expect(lost.ok).toBe(true);
  });

  it('rejects a reused historical name with the wrong hash', () => {
    const result = evaluateHistoricalArtifacts({
      searchRoots: ['/tmp'],
      listFiles: () => ['/tmp/ci-verification.json'],
      hashFile: () => '0'.repeat(64)
    });
    expect(result.status).toBe('HISTORICAL_ARTIFACT_NAME_REUSED_HASH_MISMATCH');
    expect(result.ok).toBe(false);
  });

  it('accepts a hash match as recovered originals', () => {
    const hashes = new Map(
      WP_B6_HISTORICAL_ARTIFACTS.map((item) => [
        `/opt/cursor/artifacts/${item.name}`,
        item.sha256
      ])
    );
    const result = evaluateHistoricalArtifacts({
      searchRoots: ['/opt/cursor/artifacts'],
      listFiles: () => [...hashes.keys()],
      hashFile: (path) => hashes.get(path)
    });
    expect(result.status).toBe('HASH_MATCH');
    expect(result.newEvidenceSet).toBe(false);
    expect(result.recovered).toBe(12);
  });
});
