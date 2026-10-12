import { describe, expect, it } from 'vitest';

import {
  auc,
  compositeScore,
  fitAwardModel,
  leaveOneOut,
  predictAward,
  higherIsBetter,
  lowerIsBetter,
  nearReference,
  withinBand
} from './composite.mjs';
import {
  alignmentLines,
  clusterCount,
  cplStats,
  durationLimit,
  motionConformance,
  ngoBalance,
  ngoDensity,
  spacingConformance,
  targetSizeStats,
  typeScaleStats,
  unionArea,
  whitespaceRatio
} from './layout-metrics.mjs';
import {
  attentionEntropy,
  colourClusters,
  colourfulness,
  contrastRatio,
  edgeDensity,
  edgeMap,
  fft2d,
  mirrorSymmetry,
  saliencyShare,
  spectralResidualSaliency
} from './pixel-metrics.mjs';

/** 以 `paint(x, y) → [r, g, b]` 產生合成影像。 */
function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

const grey = () => [128, 128, 128];

describe('pixel metrics', () => {
  it('contrast ratio follows the WCAG definition', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([90, 90, 90], [90, 90, 90])).toBeCloseTo(1, 5);
  });

  it('colourfulness is zero for grey and matches the formula for flat red', () => {
    expect(colourfulness(image(8, 8, grey))).toBeCloseTo(0, 5);
    // rg = 255, yb = 127.5, no variance: M = 0.3 * sqrt(255^2 + 127.5^2).
    expect(colourfulness(image(8, 8, () => [255, 0, 0]))).toBeCloseTo(
      0.3 * Math.hypot(255, 127.5),
      3
    );
  });

  it('colourfulness honours the mask', () => {
    const half = image(10, 2, (x) => (x < 5 ? [255, 0, 0] : [128, 128, 128]));
    expect(colourfulness(half, (x) => x >= 5)).toBeCloseTo(0, 5);
  });

  it('edge density is zero on flat images and finds a single boundary', () => {
    expect(edgeDensity(edgeMap(image(20, 20, grey)))).toBe(0);
    const split = image(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
    const density = edgeDensity(edgeMap(split));
    // The boundary marks two pixel columns on the 18 interior rows.
    expect(density).toBeCloseTo((2 * 18) / 400, 5);
  });

  it('mirror symmetry is 1 for a mirrored pattern and 0 for a one-sided one', () => {
    const symmetric = image(21, 21, (x) =>
      x === 5 || x === 15 ? [0, 0, 0] : [255, 255, 255]
    );
    const edges = edgeMap(symmetric);
    expect(mirrorSymmetry(edges, 21, 21)).toBeCloseTo(1, 5);
    const oneSided = image(41, 21, (x) =>
      x === 4 ? [0, 0, 0] : [255, 255, 255]
    );
    expect(mirrorSymmetry(edgeMap(oneSided), 41, 21)).toBe(0);
  });

  it('colour clusters count significant bins and the dominant share', () => {
    const twoTone = image(10, 10, (x) =>
      x < 5 ? [10, 200, 30] : [250, 250, 250]
    );
    expect(colourClusters(twoTone)).toEqual({
      significant: 2,
      dominantShare: 0.5
    });
  });

  it('2-D FFT round-trips', () => {
    const size = 8;
    const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i) * 10);
    const original = Float64Array.from(re);
    const im = new Float64Array(64);
    fft2d(re, im, size);
    fft2d(re, im, size, true);
    for (let i = 0; i < 64; i += 1)
      expect(re[i] / 64).toBeCloseTo(original[i], 8);
  });

  it('spectral residual saliency sums to 1 and concentrates on an odd-one-out', () => {
    // 背景要有一點紋理：純色背景加方塊的頻譜有精確的零點，log 之後的極端值會
    // 造成週期性假象。真實截圖的頻譜是連續的，不會遇到這種情況。
    let seed = 7;
    const noise = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const scene = image(128, 128, (x, y) => {
      if (x >= 80 && x < 96 && y >= 32 && y < 48) return [240, 240, 240];
      const v = 60 + noise() * 40;
      return [v, v, v];
    });
    const saliency = spectralResidualSaliency(scene);
    expect(saliency.map.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    const { lift } = saliencyShare(
      saliency,
      { left: 72, top: 24, right: 104, bottom: 56 },
      { width: 128, height: 128 }
    );
    expect(lift).toBeGreaterThan(2);
  });

  it('attention entropy is maximal for uniform maps', () => {
    const uniform = { size: 64, map: new Float64Array(64 * 64).fill(1 / 4096) };
    expect(attentionEntropy(uniform, 16)).toBeCloseTo(8, 6);
    const peaked = new Float64Array(64 * 64);
    peaked[0] = 1;
    expect(attentionEntropy({ size: 64, map: peaked }, 16)).toBe(0);
  });
});

describe('layout metrics', () => {
  const r = (left, top, right, bottom) => ({ left, top, right, bottom });

  it('union area counts overlaps once and clips to the frame', () => {
    expect(unionArea([r(0, 0, 10, 10), r(5, 5, 15, 15)])).toBe(175);
    expect(unionArea([r(-5, 0, 5, 10)], r(0, 0, 100, 100))).toBe(50);
    expect(
      whitespaceRatio([r(0, 0, 50, 100)], { width: 100, height: 100 })
    ).toBe(0.5);
  });

  it('Ngo density peaks at half coverage', () => {
    expect(ngoDensity(0.5)).toBe(1);
    expect(ngoDensity(0)).toBe(0);
    expect(ngoDensity(1)).toBe(0);
  });

  it('Ngo balance is 1 for a mirrored pair and lower when weight is one-sided', () => {
    const vp = { width: 100, height: 100 };
    expect(ngoBalance([r(10, 10, 30, 30), r(70, 70, 90, 90)], vp)).toBe(1);
    expect(ngoBalance([r(10, 40, 30, 60)], vp)).toBe(0.5);
  });

  it('alignment counts distinct edges within tolerance', () => {
    expect(clusterCount([0, 1, 2, 10, 11, 50], 2)).toBe(3);
    const aligned = alignmentLines([
      r(0, 0, 100, 10),
      r(1, 20, 101, 30),
      r(0, 40, 100, 50)
    ]);
    expect(aligned).toEqual({ lefts: 1, rights: 1, perObject: 1 / 3 });
  });

  it('characters per line estimate ignores single-line paragraphs', () => {
    const stats = cplStats([
      { chars: 60, lines: 2 },
      { chars: 10, lines: 1 }
    ]);
    expect(stats.count).toBe(1);
    expect(stats.median).toBeCloseTo(40, 6);
  });

  it('type scale consistency is zero for a geometric scale', () => {
    const stats = typeScaleStats([16, 20, 25, 20]);
    expect(stats.distinct).toBe(3);
    expect(stats.meanRatio).toBeCloseTo(1.25, 6);
    expect(stats.ratioCv).toBeCloseTo(0, 6);
  });

  it('spacing conformance checks multiples of the base', () => {
    expect(spacingConformance([4, 8, 10, 0], 4)).toEqual({
      measured: 3,
      share: 2 / 3,
      distinct: 3
    });
  });

  it('motion lint separates compositor-only entrances from UI motion', () => {
    expect(durationLimit(['opacity', 'transform'])).toBe(600);
    expect(durationLimit(['opacity', 'box-shadow'])).toBe(450);
    const result = motionConformance([
      { properties: ['opacity', 'transform'], duration: 500, iterations: 1 },
      { properties: ['opacity'], duration: 700, iterations: 1 },
      { properties: ['width'], duration: 200, iterations: 1 },
      { properties: ['transform'], duration: 300, iterations: Infinity },
      {
        properties: ['transform'],
        duration: 9000,
        iterations: 1,
        scrollDriven: true
      }
    ]);
    expect(result.violations.map((v) => v.reason)).toEqual([
      '時長 700ms > 600ms',
      '非合成屬性：width',
      '無限循環'
    ]);
    expect(result.conformance).toBeCloseTo(0.4, 6);
  });

  it('target sizes are bucketed against 24 and 44 px', () => {
    expect(
      targetSizeStats([
        { width: 100, height: 20 },
        { width: 30, height: 30 },
        { width: 48, height: 48 }
      ])
    ).toEqual({ count: 3, under24: 1, under44: 2 });
  });
});

describe('composite', () => {
  it('desirability functions map against a reference distribution', () => {
    expect(lowerIsBetter(1, [2, 3, 4])).toBe(1);
    expect(lowerIsBetter(5, [2, 3, 4])).toBe(0);
    expect(higherIsBetter(5, [2, 3, 4])).toBe(1);
    expect(nearReference(3, [2, 3, 4])).toBe(1);
    expect(nearReference(100, [2, 3, 4])).toBe(0);
    expect(withinBand(20, 17, 40)).toBe(1);
    expect(withinBand(63, 17, 40)).toBe(0);
    expect(Number.isNaN(lowerIsBetter(NaN, [1]))).toBe(true);
  });

  it('AUC is 1 for perfect separation and 0.5 for ties', () => {
    expect(auc([3, 4], [1, 2])).toBe(1);
    expect(auc([1, 1], [1, 1])).toBe(0.5);
    expect(auc([1], [2])).toBe(0);
  });

  it('composite renormalises over available components', () => {
    const components = [
      { key: 'a', weight: 0.5, parts: [{ get: (m) => m.a, fn: 'lower' }] },
      { key: 'b', weight: 0.5, parts: [{ get: (m) => m.b, fn: 'lower' }] }
    ];
    const reference = [
      { a: 2, b: 2 },
      { a: 3, b: 3 }
    ];
    expect(compositeScore({ a: 1, b: NaN }, reference, components)).toEqual({
      score: 100,
      breakdown: { a: 100, b: null }
    });
  });
});

describe('fitted award model', () => {
  const site = (name, label, x, y) => ({ name, label, x: { a: x, b: y } });
  const features = ['x.a', 'x.b'];
  const corpus = [
    site('a1', 'award', 3, 0),
    site('a2', 'award', 2.5, 1),
    site('a3', 'award', 3.2, -1),
    site('b1', 'baseline', -3, 0),
    site('b2', 'baseline', -2.4, 1),
    site('b3', 'baseline', -3.1, -1)
  ];

  it('learns the separating direction and explains it', () => {
    const model = fitAwardModel(corpus, { features, lambda: 0.1 });
    expect(model.n).toEqual({ award: 3, baseline: 3 });
    expect(model.weights[0]).toBeGreaterThan(0);
    const high = predictAward(model, site('s', 'subject', 3, 0));
    const low = predictAward(model, site('t', 'subject', -3, 0));
    expect(high.probability).toBeGreaterThan(0.5);
    expect(low.probability).toBeLessThan(0.5);
    expect(high.contributions[0].feature).toBe('x.a');
  });

  it('imputes missing values with the training mean', () => {
    const model = fitAwardModel(corpus, { features, lambda: 0.1 });
    const missing = predictAward(model, {
      name: 'm',
      label: 'subject',
      x: { a: NaN, b: 0 }
    });
    expect(
      missing.contributions.find((c) => c.feature === 'x.a').contribution
    ).toBe(0);
  });

  it('leave-one-out never scores a site with a model that saw it', () => {
    const { predictions, auc: looAuc } = leaveOneOut(corpus, {
      features,
      lambda: 0.1
    });
    expect(predictions.size).toBe(6);
    expect(looAuc).toBe(1);
  });
});
