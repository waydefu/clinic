import { describe, expect, it } from 'vitest';
import {
  BINDING_KIND,
  createSbomAttestationBinding,
  reviewSbomAttestationBinding,
  sha256Hex,
  SLSA_PROVENANCE_PREDICATE,
  WORKFLOW_FILE
} from './review-artifact-attestation.mjs';

const BYTES = Buffer.from('synthetic-sbom\n');
const DIGEST = sha256Hex(BYTES);
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

const env = {
  GITHUB_REPOSITORY: 'waydefu/clinic',
  GITHUB_SHA: COMMIT,
  GITHUB_WORKFLOW: 'verify',
  GITHUB_RUN_ID: '99'
};

function binding(overrides = {}) {
  return createSbomAttestationBinding({
    bytes: BYTES,
    env,
    attestation: {
      id: '1',
      url: 'https://github.com/waydefu/clinic/attestations/1',
      bundlePath: '/tmp/attestation.json'
    },
    ...overrides
  });
}

describe('digest', () => {
  it('returns lowercase SHA-256 hex of the exact bytes', () => {
    expect(DIGEST).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(BYTES)).toBe(DIGEST);
    expect(sha256Hex(Buffer.from('synthetic-sbom'))).not.toBe(DIGEST);
  });
});

describe('binding', () => {
  it('binds digest, repository, commit and workflow without inventing a SLSA level', () => {
    const record = binding();
    expect(record).toMatchObject({
      schemaVersion: 1,
      kind: BINDING_KIND,
      artifact: 'sbom.cdx.json',
      sha256: DIGEST,
      subjectDigest: `sha256:${DIGEST}`,
      repository: 'waydefu/clinic',
      commit: COMMIT,
      workflowFile: WORKFLOW_FILE,
      attestation: { predicate: SLSA_PROVENANCE_PREDICATE, id: '1' }
    });
    expect(JSON.stringify(record)).not.toMatch(/SLSA [0-9]/);
  });
});

describe('review', () => {
  it('accepts a complete same-commit binding', () => {
    expect(
      reviewSbomAttestationBinding({
        required: true,
        bytes: BYTES,
        expected: {
          repository: 'waydefu/clinic',
          commit: COMMIT,
          sha256: DIGEST,
          workflowFile: WORKFLOW_FILE,
          attestationUrl: 'https://github.com/waydefu/clinic/attestations/1'
        },
        binding: binding()
      })
    ).toEqual([]);
  });

  it('rejects a missing binding when required', () => {
    expect(
      reviewSbomAttestationBinding({ required: true, binding: null })
    ).toEqual(['missing attestation binding']);
  });

  it('allows a missing binding when not required', () => {
    expect(
      reviewSbomAttestationBinding({ required: false, binding: null })
    ).toEqual([]);
  });

  it('rejects a wrong digest, commit or repository', () => {
    const record = binding();
    expect(
      reviewSbomAttestationBinding({
        required: true,
        bytes: Buffer.from('other'),
        binding: record
      })
    ).toContain('digest mismatch');
    expect(
      reviewSbomAttestationBinding({
        required: true,
        expected: { commit: 'ffffffffffffffff' },
        binding: record
      })
    ).toContain('commit mismatch');
    expect(
      reviewSbomAttestationBinding({
        required: true,
        expected: { repository: 'other/repo' },
        binding: record
      })
    ).toContain('repository mismatch');
  });

  it('rejects empty or unknown provenance when required', () => {
    expect(
      reviewSbomAttestationBinding({
        required: true,
        binding: binding({ env: {}, attestation: {} })
      })
    ).toEqual(
      expect.arrayContaining([
        'commit is missing',
        'repository is missing',
        'missing attestation'
      ])
    );
  });

  it('rejects a binding that has a digest but no attestation when required', () => {
    expect(
      reviewSbomAttestationBinding({
        required: true,
        bytes: BYTES,
        expected: { commit: COMMIT, repository: 'waydefu/clinic' },
        binding: createSbomAttestationBinding({ bytes: BYTES, env })
      })
    ).toEqual(['missing attestation']);
  });

  it('does not accept an empty sha256 as success', () => {
    const record = binding();
    record.sha256 = '';
    record.subjectDigest = 'sha256:';
    expect(
      reviewSbomAttestationBinding({ required: true, binding: record })
    ).toContain('sha256 is not 64 lowercase hex chars');
  });
});
