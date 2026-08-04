import { describe, expect, it } from 'vitest';
import {
  E2E_GROUPS,
  filesFor,
  matrixGroupsIn,
  reviewGroups,
  SPEC_DIRECTORY
} from './e2e-groups.mjs';

const paths = (...names) => names.map((name) => `${SPEC_DIRECTORY}/${name}`);

const groups = {
  alpha: ['one.spec.ts'],
  beta: ['two.spec.ts', 'three.spec.ts']
};

const review = (options) =>
  reviewGroups({ groups, matrixGroups: ['alpha', 'beta'], ...options });

describe('file lists for a group', () => {
  it('prefixes the spec directory', () => {
    expect(filesFor('beta', groups)).toEqual(
      paths('two.spec.ts', 'three.spec.ts')
    );
  });

  it('reports an unknown group as null rather than an empty run', () => {
    expect(filesFor('gamma', groups)).toBeNull();
  });
});

describe('reading the matrix out of the workflow', () => {
  const workflow = (...entries) =>
    [
      '    strategy:',
      '      fail-fast: false',
      '      matrix:',
      '        group:',
      ...entries.map((entry) => `          - ${entry}`),
      '    steps:',
      '      - uses: actions/checkout@abc # v4',
      ''
    ].join('\n');

  it('takes the group names from the block sequence', () => {
    expect(
      matrixGroupsIn(workflow('auth-rbac', 'appointments', 'mobile'))
    ).toEqual(['auth-rbac', 'appointments', 'mobile']);
  });

  // 清單結束後緊接著就是 `steps:`，其下第一行又是一個 `- uses:`。停在第一個不是
  // 純 `- <name>` 的行，才不會把 step 讀成組名。
  it('stops at the end of the list rather than running into the steps', () => {
    expect(matrixGroupsIn(workflow('ui'))).toEqual(['ui']);
  });

  it('returns null when there is no matrix to read', () => {
    expect(
      matrixGroupsIn('jobs:\n  e2e:\n    runs-on: ubuntu-latest\n')
    ).toBeNull();
  });

  it('returns null when the matrix key is there but the list is empty', () => {
    expect(
      matrixGroupsIn('      matrix:\n        group:\n    steps:\n')
    ).toBeNull();
  });
});

describe('group coverage', () => {
  it('passes when every spec is claimed exactly once', () => {
    expect(
      review({
        specFiles: paths('one.spec.ts', 'two.spec.ts', 'three.spec.ts')
      })
    ).toEqual([]);
  });

  // 這是拆成多個 job 之後唯一真正新增的風險：新 spec 沒人收，於是靜靜地不再執行。
  it('fails on a spec that no group would run', () => {
    const failures = review({
      specFiles: paths(
        'one.spec.ts',
        'two.spec.ts',
        'three.spec.ts',
        'orphan.spec.ts'
      )
    });
    expect(failures).toEqual([
      `Spec belongs to no E2E group and would never run: ${SPEC_DIRECTORY}/orphan.spec.ts`
    ]);
  });

  it('fails on a listed spec that has been renamed away', () => {
    const failures = review({
      specFiles: paths('one.spec.ts', 'two.spec.ts')
    });
    expect(failures).toEqual([
      `Group beta lists a spec that does not exist: ${SPEC_DIRECTORY}/three.spec.ts`
    ]);
  });

  it('fails when two groups claim the same spec', () => {
    const failures = reviewGroups({
      groups: { alpha: ['one.spec.ts'], beta: ['one.spec.ts'] },
      matrixGroups: ['alpha', 'beta'],
      specFiles: paths('one.spec.ts')
    });
    expect(failures).toEqual([
      `Spec is in two groups (alpha and beta): ${SPEC_DIRECTORY}/one.spec.ts`
    ]);
  });
});

describe('the workflow and the list agreeing', () => {
  const specFiles = paths('one.spec.ts', 'two.spec.ts', 'three.spec.ts');

  it('fails when a defined group is never run', () => {
    expect(review({ specFiles, matrixGroups: ['alpha'] })).toEqual([
      'Group is defined here but .github/workflows/verify.yml never runs it: beta'
    ]);
  });

  it('fails when the workflow runs a group with no specs behind it', () => {
    expect(
      review({ specFiles, matrixGroups: ['alpha', 'beta', 'surgery'] })
    ).toEqual([
      '.github/workflows/verify.yml runs a group that is not defined here: surgery'
    ]);
  });

  it('fails when the matrix cannot be found at all', () => {
    expect(review({ specFiles, matrixGroups: null })).toEqual([
      'Could not read the E2E matrix from .github/workflows/verify.yml'
    ]);
  });

  it('skips the cross-check when no matrix is supplied', () => {
    expect(reviewGroups({ groups, specFiles })).toEqual([]);
  });
});

describe('the real group list', () => {
  it('never claims the same spec twice', () => {
    const all = Object.values(E2E_GROUPS).flat();
    expect(all.length).toBe(new Set(all).size);
  });
});
