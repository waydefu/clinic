import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { planBudgetReport } from '../scripts/check-performance-budget.mjs';
const root = 'apps/web/dist';
const files = new Map();
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files.set(relative(root, path).split(sep).join('/'), await readFile(path));
  }
}
await collect(root);
const budgets = JSON.parse(await readFile('apps/web/performance-budget.json', 'utf8'));
const manifest = JSON.parse(await readFile('apps/web/asset-manifest.json', 'utf8'));
const report = planBudgetReport(files, budgets, { transferSizeOf: (content) => gzipSync(content).length });
const entries = report.entries.map((entry) => {
  const limit = entry.budget?.resourceSizes?.find((item) => item.resourceType === 'total')?.budget;
  return { path: entry.path, totalBytes: entry.sizes.get('total'), totalBudgetBytes: limit * 1024, excessBytes: entry.sizes.get('total') - limit * 1024, resources: entry.resources.map((path) => ({ path, source: Object.entries(manifest).find(([, built]) => built === path)?.[0], gzipBytes: gzipSync(files.get(path)).length })) };
});
await mkdir('output/calendar-time-probe', { recursive: true });
await writeFile('output/calendar-time-probe/performance-budget.json', JSON.stringify({ entries, violations: report.violations }, null, 2));
console.log(JSON.stringify(entries.map(({ path, totalBytes, totalBudgetBytes, excessBytes }) => ({ path, totalBytes, totalBudgetBytes, excessBytes })), null, 2));
