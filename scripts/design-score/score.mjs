#!/usr/bin/env node
/**
 * 網頁美學計分（研究版，不是 gate）。
 *
 *   node scripts/design-score/score.mjs corpus scripts/design-score/corpus.json [--out DIR，預設 output/design-score] [--force]
 *   node scripts/design-score/score.mjs url <url> --name <name> [--label subject] [--out DIR]
 *   node scripts/design-score/score.mjs report [--out DIR]
 *
 * 每個網址在桌機 1440×900 與手機 390×844（皆 DPR 1）各量一次：先慢慢捲到底觸發
 * 延遲載入與進場效果並記錄動畫，再回到頂端逐格（最多 6 格視窗高）截圖與量 DOM。
 * 結果寫成 <out>/<name>.json，首屏截圖存 <name>-<viewport>.png；`report` 以
 * 得獎語料為參考分布算綜合分數（得獎網站本身用留一法），並以 AUC 驗證分數能否
 * 分開得獎與一般網站。
 *
 * 語料條目可加 `"exclude": "原因"`：人工檢視首屏後判定無效的網站不量、不計。
 *
 * 重要：分數只用來比較同一頁的不同版本與偵測退步，不是得獎預測；無障礙另列硬性
 * 關卡，不進綜合分數。依據見 docs/design/2026-10-12-design-research.md。
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, devices } from '@playwright/test';

import { collectAnimations, collectFrame } from './collect.mjs';
import {
  auc,
  compositeScore,
  featureValue,
  fitAwardModel,
  leaveOneOut,
  MODEL_FEATURES,
  predictAward
} from './composite.mjs';
import {
  alignmentLines,
  cplStats,
  motionConformance,
  ngoBalance,
  ngoDensity,
  targetSizeStats,
  typeScaleStats,
  whitespaceRatio
} from './layout-metrics.mjs';
import {
  attentionEntropy,
  colourClusters,
  colourfulness,
  contrastRatio,
  edgeDensity,
  edgeMap,
  mirrorSymmetry,
  saliencyShare,
  spectralResidualSaliency
} from './pixel-metrics.mjs';

const PROFILES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1
  }
};
const MAX_FRAMES = 6;
// 每個網站、每種裝置的時間上限。超過就停在已量到的格數，避免一個重網站拖垮整批。
const PROFILE_BUDGET_MS = 120_000;
const PIXEL_WIDTH = 960;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mean = (xs) => {
  const f = xs.filter((x) => Number.isFinite(x));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
};
const median = (xs) => {
  const f = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return f.length ? f[Math.floor((f.length - 1) / 2)] : NaN;
};
const round = (x, d = 4) =>
  Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null;

/** 在空白分頁用 canvas 解碼 PNG 並縮到 PIXEL_WIDTH，回傳 RGBA。 */
async function decodePng(decoder, buffer) {
  const { w, h, b64 } = await decoder.evaluate(
    async ({ png, maxWidth }) => {
      const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxWidth / bitmap.width);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
      }
      return { w: width, h: height, b64: btoa(binary) };
    },
    { png: buffer.toString('base64'), maxWidth: PIXEL_WIDTH }
  );
  return { width: w, height: h, data: Buffer.from(b64, 'base64') };
}

function frameMetrics(frame, image, jpegBytes, withSaliency) {
  const vp = frame.viewport;
  const objects = [
    ...frame.textBlocks.map((b) => b.rect),
    ...frame.mediaRects,
    ...frame.controls
  ];
  const content = [...frame.textRects, ...frame.mediaRects, ...frame.controls];
  const whitespace = whitespaceRatio(content, vp);
  const edges = edgeMap(image);
  const out = {
    colourfulness: colourfulness(image),
    edgeDensity: edgeDensity(edges),
    symmetry: mirrorSymmetry(edges, image.width, image.height),
    colourClusters: colourClusters(image).significant,
    whitespace,
    density: ngoDensity(1 - whitespace),
    balance: ngoBalance(objects, vp),
    alignmentPerObject: alignmentLines([
      ...frame.textBlocks.map((b) => b.rect),
      ...frame.mediaRects
    ]).perObject,
    leafBlocks: objects.length,
    textGroups: frame.textBlocks.length,
    jpegBpp: jpegBytes ? (jpegBytes * 8) / (vp.width * vp.height) : NaN
  };
  if (withSaliency) {
    const saliency = spectralResidualSaliency(image);
    out.attentionEntropy = attentionEntropy(saliency);
    out.ctaLift = frame.cta ? saliencyShare(saliency, frame.cta, vp).lift : NaN;
    out.hasCta = Boolean(frame.cta);
  }
  return out;
}

function pageTypography(frames) {
  const blocks = frames.flatMap((f) => f.textBlocks);
  const prose = blocks.filter((b) => b.cjkChars >= 20);
  const sizes = blocks.filter((b) => b.chars >= 2).map((b) => b.fontSize);
  const scale = typeScaleStats(sizes);
  const cpl = cplStats(
    prose.map((b) => ({ chars: b.cjkChars, lines: b.lines }))
  );
  const leading = median(prose.map((b) => b.lineHeight / b.fontSize));
  const leadingUnset =
    prose.length === 0
      ? 0
      : prose.filter((b) => b.lineHeightNormal).length / prose.length;
  const contrastFails = blocks.filter((b) => {
    if (!b.color || !b.background) return false;
    const ratio = contrastRatio(
      [b.color.r, b.color.g, b.color.b],
      [b.background.r, b.background.g, b.background.b]
    );
    const large =
      b.fontSize >= 24 || (b.fontSize >= 18.66 && b.fontWeight >= 700);
    return ratio < (large ? 3 : 4.5);
  }).length;
  return {
    distinctFontSizes: scale.distinct,
    smallestFont: scale.smallest,
    typeMeanRatio: scale.meanRatio,
    typeRatioCv: scale.ratioCv,
    cplMedian: cpl.median,
    cplP95: cpl.p95,
    cplOver48: cpl.over48,
    proseLeading: leading,
    proseLeadingUnsetShare: leadingUnset,
    contrastFails,
    textBlocks: blocks.length
  };
}

async function measureProfile(
  browser,
  decoder,
  url,
  profileName,
  outDir,
  name
) {
  const context = await browser.newContext({
    ...PROFILES[profileName],
    locale: 'zh-TW'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  // 重的網站可能很久都不觸發 load；骨架出來後最多再等 8 秒，量得到多少算多少。
  const deadline = Date.now() + PROFILE_BUDGET_MS;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('load', { timeout: 8_000 }).catch(() => {});
    await wait(2500);
    // 慢慢捲到底：觸發延遲載入與進場效果，同時取樣動畫。
    const seen = new Map();
    const sample = async () => {
      for (const a of await page.evaluate(collectAnimations)) {
        const key = `${a.target}|${a.properties.join(',')}|${Math.round(a.duration)}|${a.scrollDriven}`;
        if (!seen.has(key)) seen.set(key, a);
      }
    };
    await sample();
    const vh = PROFILES[profileName].viewport.height;
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight
    );
    for (
      let y = 0;
      y < Math.min(height, vh * (MAX_FRAMES + 2));
      y += Math.round(vh * 0.6)
    ) {
      if (Date.now() > deadline) break;
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await wait(150);
      await sample();
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(600);

    const frames = [];
    const metrics = [];
    const frameCount = Math.max(
      1,
      Math.min(MAX_FRAMES, Math.ceil(height / vh))
    );
    for (let k = 0; k < frameCount; k += 1) {
      // 時間到了就停，已量到的格數照樣計分（至少要有首屏）。
      if (k > 0 && Date.now() > deadline) break;
      await page.evaluate((top) => window.scrollTo(0, top), k * vh);
      await wait(350);
      const png = await page.screenshot({
        animations: 'disabled',
        caret: 'hide'
      });
      const jpeg =
        k === 0
          ? await page.screenshot({
              type: 'jpeg',
              quality: 75,
              animations: 'disabled',
              caret: 'hide'
            })
          : null;
      if (k === 0)
        writeFileSync(join(outDir, `${name}-${profileName}.png`), png);
      const frame = await page.evaluate(collectFrame);
      const image = await decodePng(decoder, png);
      frames.push(frame);
      metrics.push(frameMetrics(frame, image, jpeg?.length, k === 0));
    }
    const hero = metrics[0];
    const keys = [
      'colourfulness',
      'edgeDensity',
      'symmetry',
      'colourClusters',
      'whitespace',
      'density',
      'balance',
      'alignmentPerObject',
      'leafBlocks',
      'textGroups'
    ];
    const page_ = Object.fromEntries(
      keys.map((k) => [k, mean(metrics.map((m) => m[k]))])
    );
    const typography = pageTypography(frames);
    const motion = motionConformance([...seen.values()]);
    const targets = targetSizeStats(frames.flatMap((f) => f.targets));
    const r = (o) =>
      Object.fromEntries(
        Object.entries(o).map(([k, v]) => [
          k,
          typeof v === 'number' ? round(v) : v
        ])
      );
    return {
      frames: metrics.length,
      scrollHeight: height,
      hero: r(hero),
      page: r({ ...page_, ...typography }),
      motion: {
        count: motion.count,
        conformance: round(motion.conformance),
        maxDuration: round(motion.maxDuration, 0),
        violations: motion.violations
          .slice(0, 12)
          .map((v) => `${v.target}: ${v.reason}`)
      },
      gates: {
        contrastFails: typography.contrastFails,
        targetsUnder24: targets.under24,
        targetsUnder44: targets.under44,
        targets: targets.count
      }
    };
  } finally {
    await context.close();
  }
}

async function measure(browser, decoder, entry, outDir) {
  const result = {
    name: entry.name,
    url: entry.url,
    label: entry.label,
    note: entry.note ?? '',
    measuredAt: new Date().toISOString()
  };
  for (const profile of Object.keys(PROFILES)) {
    try {
      result[profile] = await measureProfile(
        browser,
        decoder,
        entry.url,
        profile,
        outDir,
        entry.name
      );
    } catch (error) {
      result[profile] = {
        error: String(error.message ?? error).split('\n')[0]
      };
    }
  }
  writeFileSync(
    join(outDir, `${entry.name}.json`),
    `${JSON.stringify(result, null, 2)}\n`
  );
  return result;
}

function loadResults(outDir) {
  return readdirSync(outDir)
    .filter((f) => f.endsWith('.json') && f !== 'report.json')
    .map((f) => JSON.parse(readFileSync(join(outDir, f), 'utf8')))
    .filter(
      (r) => r.desktop && !r.desktop.error && r.mobile && !r.mobile.error
    );
}

export function buildReport(results) {
  const awards = results.filter((r) => r.label === 'award');
  const baselines = results.filter((r) => r.label === 'baseline');
  const model = fitAwardModel(results);
  const validation = leaveOneOut(results);
  const scored = results.map((r) => {
    // 已標註的網站用「沒有它」的模型預測，避免自我參照；其他網站用全部資料的模型。
    const full = predictAward(model, r);
    const probability = validation.predictions.has(r.name)
      ? validation.predictions.get(r.name)
      : full.probability;
    return { ...r, award: { probability, contributions: full.contributions } };
  });
  const perMetric = MODEL_FEATURES.map((path) => {
    const a = awards.map((r) => featureValue(r, path));
    const b = baselines.map((r) => featureValue(r, path));
    const j = model.features.indexOf(path);
    return {
      path,
      awardMedian: median(a),
      baselineMedian: median(b),
      aucAwardHigher: auc(a, b),
      weight: model.weights[j]
    };
  });
  // 研究先驗權重的分數保留作描述與對照：2026-10-12 首次驗證 AUC 0.23，未通過。
  const priorAuc = auc(
    awards.map(
      (r) =>
        compositeScore(
          r,
          awards.filter((a) => a !== r)
        ).score
    ),
    baselines.map((r) => compositeScore(r, awards).score)
  );
  return {
    awards: awards.length,
    baselines: baselines.length,
    looAuc: validation.auc,
    priorAuc,
    perMetric,
    scored
  };
}

const LABEL = {
  'desktop.hero.edgeDensity': '桌機首屏邊緣密度',
  'desktop.hero.jpegBpp': '桌機首屏壓縮複雜度',
  'desktop.hero.colourfulness': '桌機首屏色彩豐富度',
  'desktop.hero.whitespace': '桌機首屏留白',
  'desktop.hero.leafBlocks': '桌機首屏物件數',
  'desktop.hero.balance': '桌機首屏平衡',
  'desktop.hero.symmetry': '桌機首屏左右對稱',
  'desktop.hero.ctaLift': '桌機主按鈕顯著度',
  'desktop.hero.attentionEntropy': '桌機首屏注意力分散度',
  'desktop.page.edgeDensity': '桌機全頁邊緣密度',
  'desktop.page.whitespace': '桌機全頁留白',
  'desktop.page.colourClusters': '桌機全頁色彩數',
  'desktop.page.alignmentPerObject': '桌機對齊線／物件',
  'desktop.page.distinctFontSizes': '字級種類數',
  'desktop.page.typeRatioCv': '字級比例不一致度',
  'desktop.page.balance': '桌機全頁平衡',
  'mobile.hero.edgeDensity': '手機首屏邊緣密度',
  'mobile.hero.jpegBpp': '手機首屏壓縮複雜度',
  'mobile.hero.attentionEntropy': '手機首屏注意力分散度',
  'mobile.page.whitespace': '手機全頁留白',
  'mobile.page.alignmentPerObject': '手機對齊線／物件',
  'mobile.page.edgeDensity': '手機全頁邊緣密度'
};

function renderReport(report) {
  const lines = [];
  const top = (r, sign) =>
    r.award.contributions
      .filter((c) =>
        sign > 0 ? c.contribution > 0.05 : c.contribution < -0.05
      )
      .slice(0, 3)
      .map((c) => LABEL[c.feature] ?? c.feature)
      .join('、') || '—';
  lines.push('# 美學計分報告');
  lines.push('');
  lines.push(
    `得獎 ${report.awards} 個、一般 ${report.baselines} 個。「像得獎網站」模型（22 項指標、L2 羅吉斯迴歸）留一法 AUC = ${round(report.looAuc, 3)}；研究先驗權重的舊分數 AUC = ${round(report.priorAuc, 3)}（未通過，僅供對照）。0.5 = 分不出來，1 = 完全分開；樣本小，信賴區間寬。`
  );
  lines.push('');
  lines.push(
    '機率是「這一頁的量測特徵有多像得獎的健康／診所網站」，不是好不好用、也不是得獎預測；得獎語料以西方健康品牌為主。'
  );
  lines.push('');
  lines.push(
    '| 網站 | 類別 | 像得獎 | 推高的主要因素 | 拉低的主要因素 | 動效合規 | 對比不足 | 目標<24 |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of [...report.scored].sort(
    (a, b) => b.award.probability - a.award.probability
  )) {
    lines.push(
      `| ${r.name} | ${r.label} | ${Math.round(r.award.probability * 100)}% | ${top(r, 1)} | ${top(r, -1)} | ${r.desktop.motion.conformance} (${r.desktop.motion.count}) | ${r.desktop.gates.contrastFails}/${r.mobile.gates.contrastFails} | ${r.desktop.gates.targetsUnder24}/${r.mobile.gates.targetsUnder24} |`
    );
  }
  lines.push('');
  lines.push('## 單項指標：得獎 vs 一般');
  lines.push('');
  lines.push('| 指標 | 得獎中位數 | 一般中位數 | AUC（得獎較高） | 模型權重 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const m of report.perMetric) {
    lines.push(
      `| ${LABEL[m.path] ?? m.path} | ${round(m.awardMedian, 3)} | ${round(m.baselineMedian, 3)} | ${round(m.aucAwardHigher, 2)} | ${round(m.weight, 2)} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const outDir = flag('--out', 'output/design-score');
  mkdirSync(outDir, { recursive: true });
  const mode = args[0];

  if (mode === 'corpus' || mode === 'url') {
    const entries =
      mode === 'corpus'
        ? JSON.parse(readFileSync(args[1], 'utf8')).entries
        : [
            {
              name: flag('--name', 'subject'),
              url: args[1],
              label: flag('--label', 'subject')
            }
          ];
    const browser = await chromium.launch();
    const decoder = await (await browser.newContext()).newPage();
    try {
      for (const entry of entries) {
        // 人工檢視首屏後判定無效的網站（停放網域、只剩同意視窗、被擋）標上 exclude，
        // 不量，舊結果一併刪除，避免混進參考分布。
        if (entry.exclude) {
          for (const suffix of ['.json', '-desktop.png', '-mobile.png']) {
            rmSync(join(outDir, `${entry.name}${suffix}`), { force: true });
          }
          console.log(`exclude ${entry.name}：${entry.exclude}`);
          continue;
        }
        if (
          !args.includes('--force') &&
          existsSync(join(outDir, `${entry.name}.json`))
        ) {
          console.log(`skip ${entry.name}（已有結果，--force 重量）`);
          continue;
        }
        const started = Date.now();
        const r = await measure(browser, decoder, entry, outDir);
        const status = ['desktop', 'mobile']
          .map((p) => (r[p].error ? `${p} ERROR ${r[p].error}` : `${p} ok`))
          .join('；');
        console.log(
          `${entry.name}（${entry.label}）${status}，${Math.round((Date.now() - started) / 1000)}s`
        );
      }
    } finally {
      await browser.close();
    }
  }

  if (mode === 'report' || mode === 'corpus' || mode === 'url') {
    const report = buildReport(loadResults(outDir));
    writeFileSync(
      join(outDir, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
    const md = renderReport(report);
    writeFileSync(join(outDir, 'report.md'), md);
    console.log(md);
  } else {
    console.error(
      '用法：score.mjs corpus <file> | url <url> --name <n> | report  [--out DIR] [--force]'
    );
    process.exitCode = 2;
  }
}

if (process.argv[1] && process.argv[1].endsWith('score.mjs')) {
  await main();
}
