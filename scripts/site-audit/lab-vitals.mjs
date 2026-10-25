#!/usr/bin/env node
/**
 * 網站稽核：節流後的實驗室載入量測（研究工具，不是 gate）。
 *
 *   node scripts/site-audit/lab-vitals.mjs <url>... [--runs 3] [--out FILE]
 *
 * 用 Pixel 7 手機視窗，加上與 Lighthouse 行動版預設相同的節流：CPU 4 倍降速、
 * Slow 4G（RTT 150ms、下行 1.6Mbps、上行 750kbps）。每次都開新 context（冷快取），
 * 量 runs 次取中位數。CI 的 tests/e2e/performance.spec.ts 不節流，只能抓退步；
 * 評 docs/design/site-audit-rubric.md 的 B 項要用這支的數字。
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { chromium, devices } from '@playwright/test';

export const THROTTLE = {
  cpuRate: 4,
  latencyMs: 150,
  downloadKbps: 1600,
  uploadKbps: 750
};

/** web.dev 的「良好／需要改善」界線；超過第二個值即為「差」。 */
export const THRESHOLDS = {
  lcp: [2500, 4000],
  fcp: [1800, 3000],
  cls: [0.1, 0.25],
  tbt: [200, 600]
};

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function rate(metric, value) {
  if (value === null) return 'unavailable';
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return 'good';
  return value <= poor ? 'needs-improvement' : 'poor';
}

// 在頁面任何程式執行前裝好觀察器。
// shortcut: CLS 用簡單加總（不小於正式的 session-window CLS）、TBT 用 FCP 後長任務
// 超過 50ms 的部分加總（不算到 TTI 為止），頁面位移或長任務多到接近門檻時改用 web-vitals 套件的算法。
function installObservers() {
  const v = { lcp: null, fcp: null, cls: 0, tbt: 0 };
  globalThis.__labVitals = v;
  const watch = (type, onEntry) =>
    new PerformanceObserver((list) =>
      list.getEntries().forEach(onEntry)
    ).observe({ type, buffered: true });
  watch('largest-contentful-paint', (e) => {
    v.lcp = e.renderTime || e.loadTime || e.startTime;
  });
  watch('paint', (e) => {
    if (e.name === 'first-contentful-paint') v.fcp = e.startTime;
  });
  watch('layout-shift', (e) => {
    if (!e.hadRecentInput) v.cls += e.value;
  });
  watch('longtask', (e) => {
    if (v.fcp !== null && e.startTime >= v.fcp)
      v.tbt += Math.max(0, e.duration - 50);
  });
}

async function measureOnce(browser, url) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  try {
    const page = await context.newPage();
    await page.addInitScript(installObservers);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: THROTTLE.latencyMs,
      downloadThroughput: (THROTTLE.downloadKbps * 1024) / 8,
      uploadThroughput: (THROTTLE.uploadKbps * 1024) / 8
    });
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: THROTTLE.cpuRate
    });
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    // 讓晚到的 LCP 候選與延遲載入有機會出現。
    await page.waitForTimeout(3_000);
    return await page.evaluate(() => ({
      ...globalThis.__labVitals,
      bytes: performance
        .getEntriesByType('navigation')
        .concat(performance.getEntriesByType('resource'))
        .reduce((sum, e) => sum + (e.transferSize || 0), 0)
    }));
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const take = (name, fallback) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args.splice(i, 2)[1];
  };
  const out = take('--out', null);
  const runs = Number(take('--runs', '3'));
  if (args.length === 0 || !(runs >= 1)) {
    console.error('用法：lab-vitals.mjs <url>... [--runs 3] [--out FILE]');
    process.exitCode = 2;
    return;
  }
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const url of args) {
      const samples = [];
      for (let i = 0; i < runs; i += 1)
        samples.push(await measureOnce(browser, url));
      const summary = Object.fromEntries(
        ['lcp', 'fcp', 'cls', 'tbt', 'bytes'].map((m) => [
          m,
          median(samples.map((s) => s[m]))
        ])
      );
      const ratings = Object.fromEntries(
        Object.keys(THRESHOLDS).map((m) => [m, rate(m, summary[m])])
      );
      results.push({
        url,
        throttle: THROTTLE,
        runs,
        summary,
        ratings,
        samples
      });
      console.log(
        `${url}  LCP ${summary.lcp ?? '—'}ms（${ratings.lcp}）  FCP ${summary.fcp ?? '—'}ms  ` +
          `CLS ${summary.cls?.toFixed(3) ?? '—'}  TBT ${summary.tbt ?? '—'}ms  ` +
          `傳輸 ${summary.bytes === null ? '—' : Math.round(summary.bytes / 1024)} KiB`
      );
    }
  } finally {
    await browser.close();
  }
  if (out) writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('lab-vitals.mjs')) {
  await main();
}
