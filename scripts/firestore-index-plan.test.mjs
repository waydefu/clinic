import { describe, expect, it } from 'vitest';
import {
  evaluateFirestoreIndexPlan,
  findUnlistedQueryShapes,
  loadFirestoreIndexes,
  loadQueryIndexMatrix,
  loadQuerySources
} from './firestore-index-plan.mjs';

const fixture = (text, path = 'apps/api/src/firestore/fixture.ts') => [
  { path, text }
];
const entry = (collection, fields, composite) => ({
  id: `${collection}-${fields.join('-')}`,
  collection,
  fields,
  composite
});
const matrixOf = (...queries) => ({ directClientAccess: 'deny', queries });
const issuesFor = (text, ...queries) =>
  findUnlistedQueryShapes(fixture(text), matrixOf(...queries));

describe('code -> matrix direction (B-44)', () => {
  it('fails on a composite query shape that the matrix does not list', () => {
    const issues = issuesFor(`
      class Repo {
        list(owner: string) {
          return this.db
            .collection('widgets')
            .where('owner', '==', owner)
            .orderBy('createdAt', 'asc')
            .limit(10)
            .get();
        }
      }
    `);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('widgets');
    expect(issues[0]).toContain('owner, createdAt');
    expect(issues[0]).toContain('fixture.ts:');
  });

  it('passes the same shape once the matrix lists it', () => {
    const text = `this.db.collection('widgets').where('owner','==',o).orderBy('createdAt')`;
    expect(
      issuesFor(text, entry('widgets', ['owner', 'createdAt'], true))
    ).toEqual([]);
  });

  it('fails when a shape that needs a composite index is listed as composite:false', () => {
    const text = `this.db.collection('widgets').where('owner','==',o).orderBy('createdAt')`;
    const issues = issuesFor(
      text,
      entry('widgets', ['owner', 'createdAt'], false)
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('composite:false');
  });

  it('requires a listing for equality-only multi-field queries, either flag', () => {
    const text = `this.db.collection('widgets').where('a','==',1).where('b','==',2)`;
    expect(issuesFor(text)).toHaveLength(1);
    expect(issuesFor(text, entry('widgets', ['a', 'b'], false))).toEqual([]);
    expect(issuesFor(text, entry('widgets', ['a', 'b'], true))).toEqual([]);
  });

  it('ignores single-field shapes, including a range plus orderBy on one field', () => {
    expect(
      issuesFor(`
        this.db.collection('widgets').where('at','>=',a).where('at','<',b).orderBy('at').get();
        this.db.collection('widgets').where('enabled','==',true).count().get();
      `)
    ).toEqual([]);
  });

  it('accepts a listing that omits the implicit trailing document-name tiebreaker', () => {
    const text = `this.db.collection('widgets').where('s','==',1).orderBy('at').orderBy(FieldPath.documentId())`;
    expect(issuesFor(text, entry('widgets', ['s', 'at'], true))).toEqual([]);
    expect(issuesFor(text)).toHaveLength(1);
  });

  it('resolves a collection constant declared in the same file or an imported source', () => {
    const sources = [
      {
        path: 'apps/api/src/firestore/names.ts',
        text: `export const COLLECTIONS = { widgets: 'widgets' } as const;`
      },
      {
        path: 'apps/api/src/firestore/local.ts',
        text: `const LOCAL = { gadgets: 'gadgets' } as const;
          this.db.collection(LOCAL.gadgets).where('a','==',1).orderBy('b');`
      },
      {
        path: 'apps/api/src/firestore/imported.ts',
        text: `import { COLLECTIONS } from './names.js';
          this.db.collection(COLLECTIONS.widgets).where('a','==',1).orderBy('b');`
      }
    ];
    const issues = findUnlistedQueryShapes(sources, matrixOf());
    expect(issues).toHaveLength(2);
    expect(issues.join('\n')).toContain('gadgets');
    expect(issues.join('\n')).toContain('widgets');
  });

  it('fails closed when a multi-field chain cannot be analysed', () => {
    const unresolved = issuesFor(
      `this.db.collection(somewhereElse.name).where('a','==',1).orderBy('b')`
    );
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('Cannot resolve');
    const opaque = issuesFor(`helper(base).where('a','==',1).orderBy('b')`);
    expect(opaque).toHaveLength(1);
    expect(opaque[0]).toContain('Cannot resolve');
    const dynamic = issuesFor(
      `this.db.collection('widgets').where(field,'==',1).orderBy('b')`
    );
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0]).toContain('Cannot resolve');
  });

  it('is wired into the plan evaluation and reports the unlisted shape', () => {
    const result = evaluateFirestoreIndexPlan({
      matrix: matrixOf(),
      indexes: { indexes: [] },
      sources: fixture(
        `this.db.collection('widgets').where('a','==',1).orderBy('b')`
      )
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('widgets');
  });
});

describe('repository inventory', () => {
  it('scans the API Firestore repositories and skips test files', () => {
    const paths = loadQuerySources().map((source) => source.path);
    expect(paths).toContain(
      'apps/api/src/firestore/calendar-pilot.repository.ts'
    );
    expect(paths.some((path) => path.endsWith('.test.ts'))).toBe(false);
  });

  it('finds every composite query shape of the real code listed in the matrix', () => {
    expect(
      findUnlistedQueryShapes(loadQuerySources(), loadQueryIndexMatrix())
    ).toEqual([]);
    expect(
      evaluateFirestoreIndexPlan({
        matrix: loadQueryIndexMatrix(),
        indexes: loadFirestoreIndexes()
      }).ok
    ).toBe(true);
  });

  it('would fail if a real listed shape disappeared from the matrix', () => {
    const matrix = loadQueryIndexMatrix();
    const trimmed = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'calendar-candidates-review'
      )
    };
    const issues = findUnlistedQueryShapes(loadQuerySources(), trimmed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('calendar_pilot_candidates');
    expect(issues[0]).toContain('status, createdAt');
  });
});
