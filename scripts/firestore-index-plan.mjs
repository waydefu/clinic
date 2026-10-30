import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const QUERY_INDEX_MATRIX_PATH =
  'infra/firestore/query-index-matrix.json';
export const QUERY_SOURCE_DIR = 'apps/api/src/firestore';

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

export function loadQuerySources(
  readFile = readFileSync,
  readDir = readdirSync
) {
  return readDir(join(root, QUERY_SOURCE_DIR))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map((name) => {
      const path = `${QUERY_SOURCE_DIR}/${name}`;
      return { path, text: readFile(join(root, path), 'utf8') };
    });
}

// Code -> matrix direction (B-44): a static, deterministic AST scan of each
// `collection(x).where(..).orderBy(..)` chain. Known limits (shortcut: widen
// when a real query needs it): only the sources passed in are scanned, by
// default apps/api/src/firestore/*.ts, so worker and patient-directory queries
// stay matrix-only; a query built across statements or helper functions is not
// seen unless the chain itself carries two or more fields, and then it fails
// closed; a collection name resolves only from a literal or an object constant
// in the same or another scanned file.
const EQUALITY_OPERATORS = new Set([
  '==',
  'in',
  'array-contains',
  'array-contains-any'
]);

const literalText = (node) =>
  node !== undefined &&
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

function unwrap(node) {
  while (
    node !== undefined &&
    (ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function fieldName(node) {
  return (
    literalText(node) ??
    (node !== undefined && node.getText() === 'FieldPath.documentId()'
      ? '__name__'
      : undefined)
  );
}

function parseSource({ path, text }) {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const objects = new Map();
  const imports = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = unwrap(node.initializer);
      if (init !== undefined && ts.isObjectLiteralExpression(init)) {
        const entries = new Map();
        for (const property of init.properties) {
          const value = ts.isPropertyAssignment(property)
            ? literalText(unwrap(property.initializer))
            : undefined;
          if (value !== undefined) entries.set(property.name.getText(), value);
        }
        objects.set(node.name.text, entries);
      }
    }
    const bindings =
      ts.isImportDeclaration(node) && node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, {
          from: node.moduleSpecifier.text,
          exported: (element.propertyName ?? element.name).text
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { path, file, objects, imports };
}

function resolveCollection(node, parsed, byPath) {
  const literal = literalText(node);
  if (literal !== undefined) return literal;
  if (
    node === undefined ||
    !ts.isPropertyAccessExpression(node) ||
    !ts.isIdentifier(node.expression)
  ) {
    return undefined;
  }
  const local = parsed.objects.get(node.expression.text);
  if (local !== undefined) return local.get(node.name.text);
  const imported = parsed.imports.get(node.expression.text);
  if (imported === undefined || !imported.from.startsWith('.')) {
    return undefined;
  }
  const target = byPath.get(
    posix.join(
      posix.dirname(parsed.path),
      imported.from.replace(/\.js$/, '.ts')
    )
  );
  return target?.objects.get(imported.exported)?.get(node.name.text);
}

// Root-first list of the `.name(args)` calls that make up one chain.
function chainOf(outer) {
  const calls = [];
  let node = outer;
  while (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    calls.unshift({ name: node.expression.name.text, args: node.arguments });
    node = node.expression.expression;
  }
  return calls;
}

export function findUnlistedQueryShapes(sources, matrix) {
  const parsedSources = sources.map(parseSource);
  const byPath = new Map(parsedSources.map((parsed) => [parsed.path, parsed]));
  const listed = new Map(
    (matrix.queries ?? []).map((query) => [
      `${query.collection}|${(query.fields ?? []).join(',')}`,
      query.composite === true
    ])
  );
  const issues = [];

  const inspect = (outer, source) => {
    const calls = chainOf(outer);
    const queryCalls = calls.filter(
      (call) => call.name === 'where' || call.name === 'orderBy'
    );
    if (queryCalls.length === 0) return;
    const line =
      source.file.getLineAndCharacterOfPosition(outer.getStart()).line + 1;
    const where = `${source.path}:${line}`;
    const equality = [];
    const range = [];
    const order = [];
    let analysable = true;
    for (const call of queryCalls) {
      const field = fieldName(call.args[0]);
      const operator = literalText(call.args[1]);
      if (
        field === undefined ||
        (call.name === 'where' && operator === undefined)
      ) {
        analysable = false;
      } else if (call.name === 'orderBy') {
        order.push(field);
      } else {
        (EQUALITY_OPERATORS.has(operator) ? equality : range).push(field);
      }
    }
    const fields = [...new Set([...equality, ...range, ...order])];
    if (analysable && fields.length < 2) return;
    const lastCollection = calls.findLastIndex(
      (call) => call.name === 'collection' || call.name === 'collectionGroup'
    );
    const collection =
      lastCollection < 0
        ? undefined
        : resolveCollection(calls[lastCollection].args[0], source, byPath);
    if (!analysable || collection === undefined) {
      issues.push(
        `Cannot resolve the collection or field names of a multi-field query at ${where}; write it as one collection(...).where/orderBy chain with literal names so the matrix check can see it.`
      );
      return;
    }
    // A trailing document-name tiebreaker is implicit in every index.
    const shapes = [
      fields,
      ...(fields.at(-1) === '__name__' ? [fields.slice(0, -1)] : [])
    ];
    const key = shapes
      .map((list) => `${collection}|${list.join(',')}`)
      .find((candidate) => listed.has(candidate));
    const label = `${collection}: ${fields.join(', ')} at ${where}`;
    if (key === undefined) {
      issues.push(
        `Unlisted Firestore query shape ${label}; add it to ${QUERY_INDEX_MATRIX_PATH} (and to firestore.indexes.json when it needs a composite index).`
      );
    } else if (range.length + order.length > 0 && !listed.get(key)) {
      issues.push(
        `Firestore query shape ${label} needs a composite index but the matrix lists it as composite:false.`
      );
    }
  };

  for (const parsed of parsedSources) {
    const visit = (node) => {
      // Only the outermost call of a chain starts an inspection.
      const insideChain =
        node.parent !== undefined &&
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.expression === node;
      if (ts.isCallExpression(node) && !insideChain) inspect(node, parsed);
      ts.forEachChild(node, visit);
    };
    visit(parsed.file);
  }
  return issues;
}

export function evaluateFirestoreIndexPlan({
  matrix = loadQueryIndexMatrix(),
  indexes = loadFirestoreIndexes(),
  sources = loadQuerySources()
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
  issues.push(...findUnlistedQueryShapes(sources, matrix));
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
