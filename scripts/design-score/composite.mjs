/**
 * 把原始指標換算成 0–1 的「接近程度」，再加權成綜合分數 S，並提供驗證用的 AUC。
 *
 * 用法上的三條紀律（研究依據見 docs/design/2026-10-12-design-research.md）：
 * 1. S 是同一頁不同版本之間的相對比較與退步警報，不是得獎預測。最好的計算模型
 *    也只解釋約一半的人類評分變異（Reinecke 2013：48%；Bakaev 2019：調整 R² .552）。
 * 2. 參考分布取自得獎網站語料（reference），不是固定的「好數字」；得獎網站自己
 *    計分時以留一法排除自己，避免自我參照。
 * 3. 無障礙是硬性關卡，獨立在 S 之外；S 永遠不能抵銷或獎勵無障礙失敗
 *    （Ivory & Hearst 2002：高評分頁面反而有更多無障礙錯誤）。
 */

function sortedFinite(values) {
  return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 越低越好：值低於參考分布中多少比例 → 1 代表比所有參考都低。 */
export function lowerIsBetter(value, reference) {
  const ref = sortedFinite(reference);
  if (!Number.isFinite(value) || ref.length === 0) return NaN;
  const atOrAbove = ref.filter((r) => r >= value).length;
  const equal = ref.filter((r) => r === value).length;
  return (atOrAbove - equal / 2) / ref.length;
}

/** 越高越好。 */
export function higherIsBetter(value, reference) {
  const ref = sortedFinite(reference);
  if (!Number.isFinite(value) || ref.length === 0) return NaN;
  const atOrBelow = ref.filter((r) => r <= value).length;
  const equal = ref.filter((r) => r === value).length;
  return (atOrBelow - equal / 2) / ref.length;
}

/**
 * 目標帶：以參考中位數為中心，半寬取四分位距（至少中位數的 10%），
 * 距離中心一個半寬以內線性遞減到 0。
 */
export function nearReference(value, reference) {
  const ref = sortedFinite(reference);
  if (!Number.isFinite(value) || ref.length === 0) return NaN;
  const median = quantile(ref, 0.5);
  const iqr = quantile(ref, 0.75) - quantile(ref, 0.25);
  const half = Math.max(iqr, Math.abs(median) * 0.1, 1e-9);
  return Math.max(0, 1 - Math.abs(value - median) / (2 * half));
}

/** 固定區間：落在 [lo, hi] 內為 1，區間外每偏離一個區間寬度降到 0。 */
export function withinBand(value, lo, hi) {
  if (!Number.isFinite(value)) return NaN;
  if (value >= lo && value <= hi) return 1;
  const width = hi - lo || 1;
  const off = value < lo ? lo - value : value - hi;
  return Math.max(0, 1 - off / width);
}

const mean = (xs) => {
  const finite = xs.filter((x) => Number.isFinite(x));
  return finite.length === 0
    ? NaN
    : finite.reduce((a, b) => a + b, 0) / finite.length;
};

/**
 * 綜合分數的組成。權重是研究中的先驗值（尚未以本專案資料擬合）：
 * 複雜度 > 留白、對齊 > 色彩、字體、平衡、主要行動的顯著程度。
 * `get(m)` 從單頁的指標物件取值；`fn` 決定換算方式。
 */
export const COMPONENTS = [
  {
    key: 'complexity',
    weight: 0.3,
    parts: [
      { get: (m) => m.desktop.hero.edgeDensity, fn: 'lower' },
      { get: (m) => m.desktop.hero.jpegBpp, fn: 'lower' },
      { get: (m) => m.desktop.hero.leafBlocks, fn: 'lower' },
      { get: (m) => m.desktop.page.edgeDensity, fn: 'lower' },
      { get: (m) => m.mobile.hero.edgeDensity, fn: 'lower' }
    ]
  },
  {
    key: 'whitespace',
    weight: 0.15,
    parts: [
      { get: (m) => m.desktop.hero.whitespace, fn: 'near' },
      { get: (m) => m.desktop.page.whitespace, fn: 'near' },
      { get: (m) => m.mobile.page.whitespace, fn: 'near' }
    ]
  },
  {
    key: 'alignment',
    weight: 0.15,
    parts: [
      { get: (m) => m.desktop.page.alignmentPerObject, fn: 'lower' },
      { get: (m) => m.mobile.page.alignmentPerObject, fn: 'lower' }
    ]
  },
  {
    key: 'colour',
    weight: 0.1,
    parts: [
      { get: (m) => m.desktop.hero.colourfulness, fn: 'near' },
      { get: (m) => m.desktop.page.colourClusters, fn: 'lower' }
    ]
  },
  {
    key: 'typography',
    weight: 0.1,
    parts: [
      { get: (m) => m.desktop.page.cplMedian, fn: 'band', lo: 17, hi: 40 },
      { get: (m) => m.mobile.page.cplMedian, fn: 'band', lo: 14, hi: 30 },
      { get: (m) => m.desktop.page.typeRatioCv, fn: 'lower' },
      { get: (m) => m.desktop.page.distinctFontSizes, fn: 'near' }
    ]
  },
  {
    key: 'balance',
    weight: 0.1,
    parts: [
      { get: (m) => m.desktop.hero.balance, fn: 'higher' },
      { get: (m) => m.desktop.page.balance, fn: 'higher' }
    ]
  },
  {
    key: 'focus',
    weight: 0.1,
    parts: [
      { get: (m) => m.desktop.hero.ctaLift, fn: 'higher' },
      { get: (m) => m.desktop.hero.attentionEntropy, fn: 'lower' },
      { get: (m) => m.mobile.hero.ctaLift, fn: 'higher' }
    ]
  }
];

function partScore(part, metrics, reference) {
  const value = part.get(metrics);
  const refValues = reference.map((r) => part.get(r));
  switch (part.fn) {
    case 'lower':
      return lowerIsBetter(value, refValues);
    case 'higher':
      return higherIsBetter(value, refValues);
    case 'near':
      return nearReference(value, refValues);
    case 'band':
      return withinBand(value, part.lo, part.hi);
    default:
      throw new Error(`unknown fn ${part.fn}`);
  }
}

/** 單頁綜合分數（0–100）與各組成分數。缺值的組成不計入，權重重新正規化。 */
export function compositeScore(metrics, reference, components = COMPONENTS) {
  const breakdown = {};
  let weighted = 0;
  let weightSum = 0;
  for (const c of components) {
    const value = mean(c.parts.map((p) => partScore(p, metrics, reference)));
    breakdown[c.key] = Number.isFinite(value) ? Math.round(value * 100) : null;
    if (Number.isFinite(value)) {
      weighted += c.weight * value;
      weightSum += c.weight;
    }
  }
  return {
    score:
      weightSum === 0 ? null : Math.round((weighted / weightSum) * 1000) / 10,
    breakdown
  };
}

/**
 * Mann–Whitney 形式的 AUC：隨機取一個正例與一個負例，正例分數較高的機率。
 * 0.5 = 分不出來；1 = 完全分開。小樣本時信賴區間很寬，報告時要附樣本數。
 */
export function auc(positives, negatives) {
  const pos = positives.filter((v) => Number.isFinite(v));
  const neg = negatives.filter((v) => Number.isFinite(v));
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  }
  return wins / (pos.length * neg.length);
}

/*
 * ---------------------------------------------------------------------------
 * 2026-10-12 驗證結果改變了做法：上面以研究先驗權重組成的綜合分數，在語料上區分
 * 「得獎 vs 一般」的 AUC 只有 0.23（方向相反）——文獻的「越簡單越平衡越好」在這批
 * 得獎健康網站上不成立（它們圖大、字大、不對稱、物件少而大、注意力集中）。研究本身
 * 就建議以標註資料擬合權重，所以主要輸出改成下面的擬合模型；先驗分數保留作描述，
 * 不再當成品質分數。
 * ---------------------------------------------------------------------------
 */

/** 模型使用的指標：事先全部列入，不依資料挑選（挑選會讓驗證過度樂觀）。 */
export const MODEL_FEATURES = [
  'desktop.hero.edgeDensity',
  'desktop.hero.jpegBpp',
  'desktop.hero.colourfulness',
  'desktop.hero.whitespace',
  'desktop.hero.leafBlocks',
  'desktop.hero.balance',
  'desktop.hero.symmetry',
  'desktop.hero.ctaLift',
  'desktop.hero.attentionEntropy',
  'desktop.page.edgeDensity',
  'desktop.page.whitespace',
  'desktop.page.colourClusters',
  'desktop.page.alignmentPerObject',
  'desktop.page.distinctFontSizes',
  'desktop.page.typeRatioCv',
  'desktop.page.balance',
  'mobile.hero.edgeDensity',
  'mobile.hero.jpegBpp',
  'mobile.hero.attentionEntropy',
  'mobile.page.whitespace',
  'mobile.page.alignmentPerObject',
  'mobile.page.edgeDensity'
];

export function featureValue(result, path) {
  return path.split('.').reduce((node, key) => node?.[key], result);
}

const isLabelled = (r) => r.label === 'award' || r.label === 'baseline';

/**
 * L2 正則化羅吉斯迴歸（梯度下降），特徵先標準化；缺值以訓練平均補（標準化後為 0）。
 * 樣本很小（十幾個網站），所以正則化偏強，係數只當作方向與相對大小的參考。
 */
export function fitAwardModel(
  results,
  { features = MODEL_FEATURES, lambda = 2, iterations = 3000, rate = 0.05 } = {}
) {
  const train = results.filter(isLabelled);
  const raw = train.map((r) => features.map((f) => featureValue(r, f)));
  const mean = features.map((_, j) => {
    const v = raw.map((row) => row[j]).filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  });
  const sd = features.map((_, j) => {
    const v = raw.map((row) => row[j]).filter(Number.isFinite);
    const s = Math.sqrt(
      v.reduce((a, b) => a + (b - mean[j]) ** 2, 0) / (v.length || 1)
    );
    return s || 1;
  });
  const z = (row) =>
    row.map((v, j) => (Number.isFinite(v) ? (v - mean[j]) / sd[j] : 0));
  const rows = raw.map(z);
  const ys = train.map((r) => (r.label === 'award' ? 1 : 0));
  const weights = new Array(features.length).fill(0);
  let bias = 0;
  for (let t = 0; t < iterations; t += 1) {
    const gw = new Array(features.length).fill(0);
    let gb = 0;
    rows.forEach((x, i) => {
      const p =
        1 /
        (1 +
          Math.exp(-(bias + x.reduce((s, xi, j) => s + xi * weights[j], 0))));
      const e = p - ys[i];
      gb += e;
      x.forEach((xi, j) => {
        gw[j] += e * xi;
      });
    });
    for (let j = 0; j < features.length; j += 1) {
      weights[j] -= rate * ((gw[j] + lambda * weights[j]) / rows.length);
    }
    bias -= (rate * gb) / rows.length;
  }
  return {
    features,
    mean,
    sd,
    weights,
    bias,
    n: {
      award: ys.filter(Boolean).length,
      baseline: ys.filter((y) => !y).length
    }
  };
}

/** 預測「像得獎網站」的機率，並列出每項指標對 logit 的貢獻（正＝更像得獎）。 */
export function predictAward(model, result) {
  const contributions = model.features.map((f, j) => {
    const v = featureValue(result, f);
    const zj = Number.isFinite(v) ? (v - model.mean[j]) / model.sd[j] : 0;
    return { feature: f, contribution: zj * model.weights[j] };
  });
  const logit =
    model.bias + contributions.reduce((s, c) => s + c.contribution, 0);
  return {
    probability: 1 / (1 + Math.exp(-logit)),
    contributions: contributions.sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    )
  };
}

/**
 * 留一法：每個已標註網站都用「沒有它」的模型預測，回傳那些預測與 AUC。
 * 這是唯一誠實的驗證數字；用全部資料訓練再預測自己會高估。
 */
export function leaveOneOut(results, options) {
  const labelled = results.filter(isLabelled);
  const predictions = new Map();
  for (const held of labelled) {
    const model = fitAwardModel(
      results.filter((r) => r !== held),
      options
    );
    predictions.set(held.name, predictAward(model, held).probability);
  }
  const scoreOf = (label) =>
    labelled
      .filter((r) => r.label === label)
      .map((r) => predictions.get(r.name));
  return { predictions, auc: auc(scoreOf('award'), scoreOf('baseline')) };
}
