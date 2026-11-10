import { readFileSync } from 'node:fs';
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

  it('characterizes duplicate composite flags as last-entry-wins', () => {
    const text = `this.db.collection('widgets').where('owner','==',o).orderBy('createdAt')`;
    const composite = {
      ...entry('widgets', ['owner', 'createdAt'], true),
      id: 'a'
    };
    const nonComposite = {
      ...entry('widgets', ['owner', 'createdAt'], false),
      id: 'b'
    };

    expect(issuesFor(text, nonComposite, composite)).toEqual([]);
    const issues = issuesFor(text, composite, nonComposite);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('widgets: owner, createdAt');
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

  it('resolves only unambiguous top-level literal collection constants', () => {
    const query = `this.db.collection(COLLECTION).where('a','==',1).orderBy('b')`;
    const listed = entry('widgets', ['a', 'b'], true);
    expect(issuesFor(`const COLLECTION = 'widgets'; ${query}`, listed)).toEqual(
      []
    );
    expect(issuesFor(`const COLLECTION = 'widgets'; ${query}`)).toHaveLength(1);
    for (const prefix of [
      `let COLLECTION = 'widgets';`,
      `const COLLECTION = 'widgets'; function f(COLLECTION) { ${query} }`,
      `const COLLECTION = 'widgets'; { const COLLECTION = 'other'; ${query} }`,
      `const COLLECTION = 'widgets'; COLLECTION = 'other';`
    ]) {
      expect(issuesFor(`${prefix} ${query}`, listed).join('\n')).toContain(
        'Cannot resolve'
      );
    }
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

describe('matrix <-> index definitions (B-44)', () => {
  const index = {
    collectionGroup: 'widgets',
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'owner', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'ASCENDING' }
    ]
  };
  const matrix = matrixOf(entry('widgets', ['owner', 'createdAt'], true));

  it('accepts matching definitions and rejects an unlisted index', () => {
    expect(
      evaluateFirestoreIndexPlan({
        matrix,
        indexes: { indexes: [index] },
        sources: []
      })
    ).toEqual({ ok: true, issues: [] });
    const result = evaluateFirestoreIndexPlan({
      matrix: matrixOf(),
      indexes: { indexes: [index] },
      sources: []
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(
      'Unlisted composite index widgets (COLLECTION).'
    );
  });

  it('does not accept a collection-group index for a collection query', () => {
    const result = evaluateFirestoreIndexPlan({
      matrix,
      indexes: { indexes: [{ ...index, queryScope: 'COLLECTION_GROUP' }] },
      sources: []
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Missing composite index');
    expect(result.issues.join('\n')).toContain('Unlisted composite index');
  });
});

describe('repository inventory', () => {
  it('scans the API Firestore repositories and skips test files', () => {
    const paths = loadQuerySources().map((source) => source.path);
    expect(paths).toContain(
      'apps/api/src/firestore/calendar-pilot.repository.ts'
    );
    expect(paths).toContain(
      'apps/worker/src/calendar-sync/calendar-pilot-activation.ts'
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

  it('fails when the activation worker query is removed from the matrix', () => {
    const matrix = loadQueryIndexMatrix();
    const trimmed = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'calendar-pilot-appointments-confirmed-future'
      )
    };
    const sources = loadQuerySources().filter((source) =>
      source.path.endsWith('/calendar-pilot-activation.ts')
    );
    expect(sources).toHaveLength(1);
    expect(findUnlistedQueryShapes(sources, matrix)).toEqual([]);
    const issues = findUnlistedQueryShapes(sources, trimmed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('calendar_pilot_appointments');
    expect(issues[0]).toContain('status, startsAt');
  });

  it('scans the real mirror worker query against the matrix', () => {
    const path =
      'apps/worker/src/calendar-sync/firestore-calendar-sync.repository.ts';
    const sources = loadQuerySources().filter((source) => source.path === path);
    expect(sources).toHaveLength(1);
    const matrix = loadQueryIndexMatrix();
    expect(findUnlistedQueryShapes(sources, matrix)).toEqual([]);
    const trimmed = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'calendar-mirrors-external-event'
      )
    };
    const missing = findUnlistedQueryShapes(sources, trimmed);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('calendar_pilot_mirrors');
    expect(missing[0]).toContain('sourceId, externalEventId');
  });

  it('characterizes the outbox worker collection alias boundary', () => {
    const path = 'apps/worker/src/outbox-processor.ts';
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    expect(text).toContain("export const OUTBOX_COLLECTION = 'outbox_jobs'");
    const start = text.indexOf('private async dueCandidates(');
    const end = text.indexOf('private async claim(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const method = text.slice(start, end);
    const matrix = loadQueryIndexMatrix();
    const sources = fixture(`class Repo { ${method} }`, path);
    const unresolved = findUnlistedQueryShapes(sources, matrix);
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((issue) => issue.includes('Cannot resolve'))).toBe(
      true
    );

    // Direct chains are an in-memory control, not a runtime replacement.
    const alias = /\bcollection(?=\s*\.where\()/g;
    expect([...method.matchAll(alias)]).toHaveLength(2);
    const direct = fixture(
      `class Repo { ${method.replace(alias, "this.db.collection('outbox_jobs')")} }`,
      path
    );
    expect(findUnlistedQueryShapes(direct, matrix)).toEqual([]);
    const withoutOwner = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'outbox-pending-due'
      )
    };
    expect(findUnlistedQueryShapes(direct, withoutOwner)).toEqual([]);
    const withoutShapes = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) =>
          ![
            'outbox-pending-due',
            'outbox-queue-snapshot',
            'monitoring-outbox-age',
            'outbox-expired-lease'
          ].includes(query.id)
      )
    };
    const issues = findUnlistedQueryShapes(direct, withoutShapes);
    expect(issues).toHaveLength(2);
    expect(issues.join('\n')).toContain('status, nextAttemptAt');
    expect(issues.join('\n')).toContain('status, leaseExpiresAt');
  });

  it('checks the activation generation query against the matrix', () => {
    const path = 'apps/worker/src/calendar-sync/calendar-pilot-runtime.ts';
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const start = text.indexOf('private async hasUnfinishedActivation(');
    const end = text.indexOf('public run(', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const sources = fixture(`class Repo { ${text.slice(start, end)} }`, path);
    const matrix = loadQueryIndexMatrix();
    expect(findUnlistedQueryShapes(sources, matrix)).toEqual([]);
    const trimmed = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'calendar-pilot-outbox-activation-generation'
      )
    };
    const issues = findUnlistedQueryShapes(sources, trimmed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('calendar_pilot_outbox');
    expect(issues[0]).toContain('kind, generation');
  });

  it('characterizes the patient query split across withinWindow', () => {
    const path = 'apps/api/src/patients/patient-directory.ts';
    const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const pattern =
      /withinWindow\(\s*(this\.db\.collection\('appointments'\)\.where\('patientId', '==', patientId\)),\s*window\s*\)(\s*\.orderBy\('startsAt', 'asc'\)\s*\.orderBy\('__name__', 'asc'\))/g;
    const matches = [...text.matchAll(pattern)];
    expect(matches).toHaveLength(1);
    const [original, collection, ordering] = matches[0];
    const matrix = loadQueryIndexMatrix();
    const unresolved = findUnlistedQueryShapes(fixture(original, path), matrix);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toContain('Cannot resolve');

    // A direct in-memory chain is only a scanner control, not runtime code.
    const direct = fixture(`${collection}${ordering}`, path);
    expect(findUnlistedQueryShapes(direct, matrix)).toEqual([]);
    const trimmed = {
      ...matrix,
      queries: matrix.queries.filter(
        (query) => query.id !== 'appointments-by-patient'
      )
    };
    const missing = findUnlistedQueryShapes(direct, trimmed);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('appointments');
    expect(missing[0]).toContain('patientId, startsAt');
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
