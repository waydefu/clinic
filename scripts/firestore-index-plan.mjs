import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const QUERY_INDEX_MATRIX_PATH =
  'infra/firestore/query-index-matrix.json';

function indexKey(index) {
  const fields = (index.fields ?? [])
    .map((field) => `${field.fieldPath}:${field.order ?? field.arrayConfig}`)
    .join(',');
  return `${index.collectionGroup}|${fields}`;
}

export function loadQueryIndexMatrix(readFile = readFileSync) {
  return JSON.parse(readFile(join(root, QUERY_INDEX_MATRIX_PATH), 'utf8'));
}

export function loadFirestoreIndexes(readFile = readFileSync) {
  return JSON.parse(readFile(join(root, 'firestore.indexes.json'), 'utf8'));
}

export function evaluateFirestoreIndexPlan({
  matrix = loadQueryIndexMatrix(),
  indexes = loadFirestoreIndexes()
} = {}) {
  const issues = [];
  if (matrix.directClientAccess !== 'deny') {
    issues.push('Index plan must keep Firestore Rules deny-all for browsers.');
  }
  const defined = new Set((indexes.indexes ?? []).map(indexKey));
  for (const query of matrix.queries ?? []) {
    if (!query.composite) continue;
    const expected = `${query.collection}|${(query.fields ?? [])
      .map((field) => `${field}:ASCENDING`)
      .join(',')}`;
    if (!defined.has(expected)) {
      issues.push(
        `Missing composite index for ${query.id} (${query.collection}: ${query.fields.join(', ')}).`
      );
    }
  }
  return { ok: issues.length === 0, issues };
}

export function planFirestoreIndexDeploy() {
  const evaluation = evaluateFirestoreIndexPlan();
  return {
    execute: false,
    config: 'firestore.indexes.json',
    rulesRemainDenyAll: true,
    evaluation,
    deployCommand:
      'firebase deploy --only firestore:indexes --project=beauessence-clinic-stg-c1a01',
    rollback:
      'Do not delete an index still used by the previous revision. Index cleanup is a later named packet.',
    note: 'This plan does not deploy. Live indexes stay empty until a post-merge exact-SHA packet.'
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const plan = planFirestoreIndexDeploy();
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(plan.evaluation.ok ? 0 : 1);
}
