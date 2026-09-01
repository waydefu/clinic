import { describe, expect, it } from 'vitest';
import {
  HASHED_SOURCES,
  buildProjection,
  materializeAuditExceptions,
  materializeStage2,
  renderCurrentMarkdown,
  renderedArtifacts,
  reviewStateArtifacts,
  sha256Hex,
  stableStringify
} from './generate-governance-state.mjs';

const stage2 = {
  $comment: ['ignored'],
  stageSlices: { C0: 'revise', C1: 'pending' },
  deploymentAuthorities: { C1: 'not_granted', C2: 'not_granted' }
};

const audit = {
  schemaVersion: 1,
  exceptions: [],
  released: [{ ghsa: 'GHSA-mh99-v99m-4gvg' }]
};

function hashedSourceTexts(overrides = {}) {
  return [
    [
      'docs/architecture/stage-2-gate-status.json',
      JSON.stringify(overrides.stage2 ?? stage2)
    ],
    ['security/audit-exceptions.json', JSON.stringify(overrides.audit ?? audit)]
  ];
}

describe('governance state projection', () => {
  it('is deterministic across repeated builds', () => {
    const first = stableStringify(
      buildProjection({ hashedSourceTexts: hashedSourceTexts() })
    );
    const second = stableStringify(
      buildProjection({ hashedSourceTexts: hashedSourceTexts() })
    );
    expect(first).toBe(second);
  });

  it('does not persist wall-clock or containing-commit fields', () => {
    const projection = buildProjection({
      hashedSourceTexts: hashedSourceTexts()
    });
    expect(projection.generatedAt).toBeUndefined();
    expect(projection.commit).toBeUndefined();
    expect(projection.head).toBeUndefined();
    expect(projection.gitSha).toBeUndefined();
    expect(projection.generated).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(/generatedAt/);
  });

  it('hashes only the machine sources it materializes, in stable path order', () => {
    const projection = buildProjection({
      hashedSourceTexts: hashedSourceTexts()
    });
    expect(projection.sources.map((source) => source.path)).toEqual(
      [...HASHED_SOURCES].sort()
    );
    expect(projection.pointers.decisionRegister).toBe(
      'docs/product/phase-1-decision-register.md'
    );
    expect(
      projection.sources.some((source) => source.path.includes('roadmap'))
    ).toBe(false);
  });

  it('materializes stage-2 fields without embedding the source document', () => {
    const projection = buildProjection({
      hashedSourceTexts: hashedSourceTexts()
    });
    expect(projection.stage2).toEqual({
      stageSlices: { C0: 'revise', C1: 'pending' },
      deploymentAuthorities: { C1: 'not_granted', C2: 'not_granted' }
    });
    expect(projection.stage2.$comment).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain('ignored');
  });

  it('counts audit exceptions without copying registry entries', () => {
    const projection = buildProjection({
      hashedSourceTexts: hashedSourceTexts()
    });
    expect(projection.auditExceptions).toEqual({
      activeCount: 0,
      releasedCount: 1
    });
    expect(JSON.stringify(projection)).not.toContain('GHSA-mh99-v99m-4gvg');
  });

  it('changes sourceSnapshotSha256 when a hashed source changes', () => {
    const before = buildProjection({ hashedSourceTexts: hashedSourceTexts() });
    const after = buildProjection({
      hashedSourceTexts: hashedSourceTexts({
        stage2: {
          ...stage2,
          stageSlices: { ...stage2.stageSlices, C0: 'pending' }
        }
      })
    });
    expect(after.sourceSnapshotSha256).not.toBe(before.sourceSnapshotSha256);
    expect(after.stage2.stageSlices.C0).toBe('pending');
  });

  it('rejects malformed stage-2 input', () => {
    expect(() => materializeStage2(null)).toThrow(/object/);
    expect(() => materializeStage2({})).toThrow(/stageSlices/);
    expect(() => materializeStage2({ stageSlices: { C0: 'revise' } })).toThrow(
      /deploymentAuthorities/
    );
  });

  it('rejects malformed audit-exception input', () => {
    expect(() => materializeAuditExceptions(null)).toThrow(/object/);
    expect(() => materializeAuditExceptions({ exceptions: [] })).toThrow(
      /released/
    );
    expect(() => materializeAuditExceptions({ released: [] })).toThrow(
      /exceptions/
    );
  });

  it('rejects a missing hashed source', () => {
    expect(() =>
      buildProjection({
        hashedSourceTexts: [
          ['docs/architecture/stage-2-gate-status.json', '{}']
        ]
      })
    ).toThrow(/missing hashed source/);
  });

  it('detects byte-for-byte drift in committed artifacts', () => {
    const artifacts = renderedArtifacts(
      buildProjection({ hashedSourceTexts: hashedSourceTexts() })
    );
    expect(
      reviewStateArtifacts({
        existingJson: artifacts.json,
        existingMd: artifacts.markdown,
        artifacts
      })
    ).toEqual([]);
    expect(
      reviewStateArtifacts({
        existingJson: artifacts.json.replace('revise', 'pending'),
        existingMd: artifacts.markdown,
        artifacts
      })
    ).toContain('docs/state/current.json is stale; regenerate it');
    expect(
      reviewStateArtifacts({
        existingJson: artifacts.json,
        existingMd: `${artifacts.markdown}# extra\n`,
        artifacts
      })
    ).toContain('docs/state/current.md is stale; regenerate it');
  });

  it('keeps JSON key order stable via sorted stringify', () => {
    const text = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    expect(text).toBe(
      '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n'
    );
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
    const markdown = renderCurrentMarkdown(
      buildProjection({ hashedSourceTexts: hashedSourceTexts() })
    );
    expect(markdown).toContain('deterministic projection, not Canon');
    expect(markdown).not.toMatch(/generatedAt/);
  });
});
