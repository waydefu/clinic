/**
 * 版面層的美學指標：輸入是 DOM 量到的矩形與數值，全部是純函式。
 * 矩形格式 `{ left, top, right, bottom }`（CSS px，視窗座標）。
 *
 * 依據（見 docs/design/2026-10-12-design-research.md）：
 * - 留白：AIM White space（Bakaev 2019：與主觀留白 τ = .635）。
 * - 密度與平衡：Ngo, Teo & Byrne (2003)；Zheng et al. 指出平衡與對稱和美感
 *   評分相關，等量中心（equilibrium）則否，所以這裡不算 equilibrium。
 * - 對齊線：AIM Lines／Grid quality（Bakaev 2019 中解釋複雜度最強的單項）。
 * - 每行字數：W3C clreq 17–40 字（上限 48）、WCAG 1.4.8 CJK ≤ 40。
 */

function clip(rect, frame) {
  const left = Math.max(rect.left, frame.left);
  const right = Math.min(rect.right, frame.right);
  const top = Math.max(rect.top, frame.top);
  const bottom = Math.min(rect.bottom, frame.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

/** 矩形聯集面積（掃描線：沿 x 切條，條內合併 y 區間）。重疊只算一次。 */
export function unionArea(rects, frame) {
  const inside = rects.map((r) => (frame ? clip(r, frame) : r)).filter(Boolean);
  const xs = [...new Set(inside.flatMap((r) => [r.left, r.right]))].sort(
    (a, b) => a - b
  );
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const spans = inside
      .filter((r) => r.left <= x0 && r.right >= x1)
      .map((r) => [r.top, r.bottom])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let curStart = -Infinity;
    let curEnd = -Infinity;
    for (const [s, e] of spans) {
      if (s > curEnd) {
        covered += curEnd - curStart > 0 ? curEnd - curStart : 0;
        curStart = s;
        curEnd = e;
      } else if (e > curEnd) {
        curEnd = e;
      }
    }
    covered += curEnd - curStart > 0 ? curEnd - curStart : 0;
    area += covered * (x1 - x0);
  }
  return area;
}

/** 留白比例 = 1 − 內容聯集面積 / 視窗面積。 */
export function whitespaceRatio(rects, viewport) {
  const frame = {
    left: 0,
    top: 0,
    right: viewport.width,
    bottom: viewport.height
  };
  const total = viewport.width * viewport.height;
  return total === 0 ? 1 : 1 - unionArea(rects, frame) / total;
}

/** Ngo 密度：DM = 1 − 2·|0.5 − 覆蓋率|，覆蓋率 50% 時為 1。 */
export function ngoDensity(coverage) {
  return 1 - 2 * Math.abs(0.5 - coverage);
}

/**
 * Ngo 平衡：w_j = Σ a_i·d_i（落在 j 半邊的物件，面積 × 物件中心到畫面中線距離），
 * BM = 1 − (|wL − wR|/max(wL, wR) + |wT − wB|/max(wT, wB)) / 2。
 * `weight(rect)` 可額外乘上視覺重量（例如 1 − 亮度）；預設只看面積。
 */
export function ngoBalance(rects, viewport, weight = () => 1) {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  let wl = 0;
  let wr = 0;
  let wt = 0;
  let wb = 0;
  for (const r of rects) {
    const area = (r.right - r.left) * (r.bottom - r.top) * weight(r);
    const mx = (r.left + r.right) / 2;
    const my = (r.top + r.bottom) / 2;
    if (mx < cx) wl += area * (cx - mx);
    else wr += area * (mx - cx);
    if (my < cy) wt += area * (cy - my);
    else wb += area * (my - cy);
  }
  const term = (a, b) =>
    Math.max(a, b) === 0 ? 0 : Math.abs(a - b) / Math.max(a, b);
  return 1 - (term(wl, wr) + term(wt, wb)) / 2;
}

/** 把數值在 `tolerance` 內聚類，回傳群數。 */
export function clusterCount(values, tolerance = 2) {
  const sorted = [...values].sort((a, b) => a - b);
  let clusters = 0;
  let last = -Infinity;
  for (const v of sorted) {
    if (v - last > tolerance) clusters += 1;
    last = v;
  }
  return clusters;
}

/**
 * 對齊：物件左緣、右緣的相異位置數（容差 2px）。`perObject` 越低代表越多物件
 * 共用同一條對齊線；這是相對量，只能在同一頁的不同版本之間比較。
 */
export function alignmentLines(rects, tolerance = 2) {
  const lefts = clusterCount(
    rects.map((r) => r.left),
    tolerance
  );
  const rights = clusterCount(
    rects.map((r) => r.right),
    tolerance
  );
  return {
    lefts,
    rights,
    perObject: rects.length === 0 ? 0 : (lefts + rights) / (2 * rects.length)
  };
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 每行字數：輸入每個段落 `{ chars, lines }`（chars 為 CJK 全形字數）。
 * 末行通常不滿，以 (lines − 0.5) 估平均每行字數；單行段落不計入。
 */
export function cplStats(paragraphs) {
  const values = paragraphs
    .filter((p) => p.lines >= 2 && p.chars > 0)
    .map((p) => p.chars / (p.lines - 0.5))
    .sort((a, b) => a - b);
  return {
    count: values.length,
    median: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    over48: values.filter((v) => v > 48).length
  };
}

/**
 * 字級系統：相異字級數，以及相鄰字級比值的一致性（log 比值的變異係數；
 * 0 = 完美等比級數）。字級先四捨五入到 0.5px。
 */
export function typeScaleStats(fontSizes) {
  const sizes = [...new Set(fontSizes.map((s) => Math.round(s * 2) / 2))].sort(
    (a, b) => a - b
  );
  const ratios = [];
  for (let i = 1; i < sizes.length; i += 1)
    ratios.push(Math.log(sizes[i] / sizes[i - 1]));
  const mean = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const sd = Math.sqrt(
    ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / (ratios.length || 1)
  );
  return {
    distinct: sizes.length,
    smallest: sizes[0] ?? 0,
    largest: sizes.at(-1) ?? 0,
    meanRatio: ratios.length ? Math.exp(mean) : 1,
    ratioCv: ratios.length && mean !== 0 ? sd / mean : 0
  };
}

/** 間距是否落在 `base` 的整數倍（±0.5px）；同時回傳相異間距值的數量。 */
export function spacingConformance(values, base = 4) {
  const positive = values.filter((v) => v > 0.5);
  const onScale = positive.filter(
    (v) => Math.abs(v / base - Math.round(v / base)) * base <= 0.5
  );
  return {
    measured: positive.length,
    share: positive.length === 0 ? 1 : onScale.length / positive.length,
    distinct: clusterCount(positive, 0.5)
  };
}

/** 合成器可直接處理、不觸發版面或重繪的屬性。 */
const COMPOSITOR_ONLY = new Set([
  'transform',
  'opacity',
  'translate',
  'scale',
  'rotate',
  'offset'
]);

/** 只動透明度與位移的進場淡入上限 600ms，其他 UI 動效 450ms。 */
export function durationLimit(properties) {
  return properties.every((p) =>
    ['opacity', 'transform', 'translate'].includes(p)
  )
    ? 600
    : 450;
}

/**
 * 動效檢查：每筆 `{ properties, duration, iterations, scrollDriven, viewTransition }`。
 * 規則（web.dev、NN/g、Vercel）：只動合成屬性；一般 UI ≤ 450ms；只動透明度與
 * 位移的進場淡入可到 600ms（研究建議的進場範圍 500–600ms）；不無限循環。捲動
 * 驅動與換頁轉場的時長不以毫秒計，只檢查屬性。
 */
export function motionConformance(animations) {
  const violations = [];
  for (const a of animations) {
    const bad = a.properties.filter((p) => !COMPOSITOR_ONLY.has(p));
    const limit = durationLimit(a.properties);
    if (bad.length > 0)
      violations.push({ ...a, reason: `非合成屬性：${bad.join(', ')}` });
    else if (!a.scrollDriven && !a.viewTransition && a.duration > limit)
      violations.push({
        ...a,
        reason: `時長 ${Math.round(a.duration)}ms > ${limit}ms`
      });
    else if (a.iterations === Infinity && !a.scrollDriven)
      violations.push({ ...a, reason: '無限循環' });
  }
  return {
    count: animations.length,
    conformance:
      animations.length === 0 ? 1 : 1 - violations.length / animations.length,
    maxDuration: Math.max(
      0,
      ...animations.filter((a) => !a.scrollDriven).map((a) => a.duration)
    ),
    violations
  };
}

/** 點按目標：最短邊 < 24px 不符合 WCAG 2.5.8 AA；< 44px 未達 AAA／業主要求。 */
export function targetSizeStats(targets) {
  const shortest = targets.map((t) => Math.min(t.width, t.height));
  return {
    count: targets.length,
    under24: shortest.filter((s) => s < 24).length,
    under44: shortest.filter((s) => s < 44).length
  };
}
