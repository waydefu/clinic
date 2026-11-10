import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const TARGETS = [
  'apps/api/src/firestore/calendar-pilot.repository.ts',
  'apps/web/public/admin-bootstrap.js',
  'apps/web/public/patient-app.js',
  'apps/web/public/clinic-site.css',
  'apps/web/public/styles.css',
  'apps/web/public/workbench.css'
];

export function lineCount(source) {
  if (!source) return 0;
  return source.split('\n').length - Number(source.endsWith('\n'));
}

// Exact, whitespace-normalized windows, not a semantic clone detector.
export function duplicateLineCounts(sources, windowSize = 5) {
  const occurrences = new Map();
  const duplicateLines = sources.map(() => new Set());
  sources.forEach((source, file) => {
    const lines = source.split('\n').map((line) => line.trim());
    for (let index = 0; index <= lines.length - windowSize; index += 1) {
      const window = lines.slice(index, index + windowSize);
      if (window.some((line) => !line)) continue;
      const key = JSON.stringify(window);
      const positions = occurrences.get(key) ?? [];
      positions.push({ file, index });
      occurrences.set(key, positions);
    }
  });
  for (const positions of occurrences.values()) {
    if (positions.length < 2) continue;
    for (const { file, index } of positions) {
      for (let offset = 0; offset < windowSize; offset += 1) {
        duplicateLines[file].add(index + offset);
      }
    }
  }
  return duplicateLines.map((lines) => lines.size);
}

export function complexity(source, file) {
  if (file.endsWith('.css')) return null;
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  if (parsed.parseDiagnostics.length > 0) {
    throw new Error(`Cannot parse ${file}`);
  }
  const values = [];
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      let value = 1;
      function count(child) {
        if (child !== node && ts.isFunctionLike(child)) return;
        if (
          ts.isIfStatement(child) ||
          ts.isForStatement(child) ||
          ts.isForInStatement(child) ||
          ts.isForOfStatement(child) ||
          ts.isWhileStatement(child) ||
          ts.isDoStatement(child) ||
          ts.isCaseClause(child) ||
          ts.isCatchClause(child) ||
          ts.isConditionalExpression(child) ||
          (ts.isBinaryExpression(child) &&
            [
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.SyntaxKind.BarBarToken,
              ts.SyntaxKind.QuestionQuestionToken
            ].includes(child.operatorToken.kind))
        ) {
          value += 1;
        }
        ts.forEachChild(child, count);
      }
      count(node);
      values.push(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return {
    functions: values.length,
    max: values.length ? Math.max(...values) : 0,
    mean: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0
  };
}

export function buildReport(files) {
  const duplicates = duplicateLineCounts(files.map(({ source }) => source));
  const rows = files.map(({ path, source }, index) => {
    const lines = lineCount(source);
    const rate = lines ? ((duplicates[index] / lines) * 100).toFixed(1) : '0.0';
    const result = complexity(source, path);
    const score = result
      ? `${result.functions} / ${result.mean.toFixed(1)} / ${result.max}`
      : 'N/A (CSS)';
    return `| ${path} | ${lines} | ${rate}% | ${score} |`;
  });
  return [
    '## RC-08 maintainability baseline (informational)',
    '',
    'Physical lines; duplicated-line percentage across the listed files uses exact trimmed five-consecutive-nonblank-line windows, including within-file duplicates. Blank lines count in the denominator.',
    'Complexity is function count / mean / maximum cyclomatic decision count using the TypeScript parser; nested functions are measured separately. CSS complexity is not measured.',
    'These are baseline indicators, not merge thresholds or evidence of production readiness.',
    '',
    '| File | Lines | Duplicated lines | Functions / mean / max |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    ''
  ].join('\n');
}

async function main() {
  const files = await Promise.all(
    TARGETS.map(async (path) => ({
      path,
      source: await readFile(path, 'utf8')
    }))
  );
  const report = buildReport(files);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  } else {
    console.log(report);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
