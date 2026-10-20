/**
 * 像素層的美學指標。輸入一律是 `{ width, height, data }`，data 為 RGBA 位元組
 * （Uint8Array／Uint8ClampedArray／Buffer 皆可）。全部是純函式，不碰檔案與瀏覽器，
 * 讓 vitest 能用合成影像逐一驗證公式。
 *
 * 依據（2026-10-12 研究整理，見 docs/design/2026-10-12-design-research.md）：
 * - 色彩豐富度：Hasler & Süsstrunk (2003)，照論文原式，不取絕對值。
 * - 邊緣密度：Mack & Oliva (2004)；Rosenholtz et al. (2007) 用於雜亂度。
 * - 對稱：AIM（Oulasvirta et al. 2018）的邊緣鏡射重疊版本。
 * - 顯著性：Hou & Zhang (2007) spectral residual；注意力熵參考 Gu et al. (2018)。
 *
 * 這些量的是「接近好設計的特徵」，不是美感本身；用法見 composite.mjs 的註解。
 */

/** sRGB 0–255 → 相對亮度（WCAG 定義）。 */
export function relativeLuminance(r, g, b) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 對比值 (L1 + 0.05) / (L2 + 0.05)，L1 為較亮者。 */
export function contrastRatio(rgbA, rgbB) {
  const a = relativeLuminance(...rgbA);
  const b = relativeLuminance(...rgbB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Hasler–Süsstrunk 色彩豐富度：rg = R − G，yb = ½(R + G) − B，
 * M = √(σrg² + σyb²) + 0.3·√(μrg² + μyb²)。單次 Welford 掃描。
 * `mask(x, y)` 回傳 false 的像素不計（例如把照片區塊排除，只量介面本身）。
 */
export function colourfulness(image, mask) {
  const { width, height, data } = image;
  let n = 0;
  let meanRg = 0;
  let meanYb = 0;
  let m2Rg = 0;
  let m2Yb = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask && !mask(x, y)) continue;
      const i = (y * width + x) * 4;
      const rg = data[i] - data[i + 1];
      const yb = 0.5 * (data[i] + data[i + 1]) - data[i + 2];
      n += 1;
      const dRg = rg - meanRg;
      meanRg += dRg / n;
      m2Rg += dRg * (rg - meanRg);
      const dYb = yb - meanYb;
      meanYb += dYb / n;
      m2Yb += dYb * (yb - meanYb);
    }
  }
  if (n === 0) return 0;
  const sdRg = Math.sqrt(m2Rg / n);
  const sdYb = Math.sqrt(m2Yb / n);
  return (
    Math.sqrt(sdRg ** 2 + sdYb ** 2) +
    0.3 * Math.sqrt(meanRg ** 2 + meanYb ** 2)
  );
}

/** 灰階（0–255，Rec. 601 加權，與多數影像處理實作一致）。 */
export function toGray(image) {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/**
 * Sobel 邊緣圖：梯度強度超過 `threshold`（0–255 灰階尺度上的強度）即為邊緣。
 * 門檻是校準參數，所有量測必須用同一個值，跨門檻的數字不能比較。
 */
export function edgeMap(image, threshold = 96) {
  const { width, height } = image;
  const gray = toGray(image);
  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (dx, dy) => gray[(y + dy) * width + (x + dx)];
      const gx =
        -at(-1, -1) -
        2 * at(-1, 0) -
        at(-1, 1) +
        at(1, -1) +
        2 * at(1, 0) +
        at(1, 1);
      const gy =
        -at(-1, -1) -
        2 * at(0, -1) -
        at(1, -1) +
        at(-1, 1) +
        2 * at(0, 1) +
        at(1, 1);
      // Sobel 的最大強度約 4·255·√2；除以 4 讓門檻落在 0–255 的直覺尺度上。
      if (Math.hypot(gx, gy) / 4 > threshold) edges[y * width + x] = 1;
    }
  }
  return edges;
}

/** 邊緣像素佔全部像素的比例。 */
export function edgeDensity(edges) {
  let count = 0;
  for (const value of edges) count += value;
  return edges.length === 0 ? 0 : count / edges.length;
}

/**
 * 左右鏡射對稱：把邊緣圖沿垂直中線翻轉、膨脹 `tolerance` 像素後，與原圖重疊的
 * 邊緣比例。1 = 完全左右對稱。編輯式不對稱版面本來就會偏低，權重應該低。
 */
export function mirrorSymmetry(edges, width, height, tolerance = 2) {
  let total = 0;
  let matched = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!edges[y * width + x]) continue;
      total += 1;
      const mx = width - 1 - x;
      let hit = false;
      for (let dy = -tolerance; dy <= tolerance && !hit; dy += 1) {
        for (let dx = -tolerance; dx <= tolerance && !hit; dx += 1) {
          const yy = y + dy;
          const xx = mx + dx;
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
          if (edges[yy * width + xx]) hit = true;
        }
      }
      if (hit) matched += 1;
    }
  }
  return total === 0 ? 1 : matched / total;
}

/**
 * 色彩聚類：每通道量化成 5 位元（32 階），計算佔畫面至少 `minShare` 的色箱數，
 * 以及最大色箱（通常是底色）的覆蓋率。
 */
export function colourClusters(image, minShare = 0.0005) {
  const { width, height, data } = image;
  const bins = new Map();
  const total = width * height;
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    const key =
      ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  let significant = 0;
  let dominant = 0;
  for (const count of bins.values()) {
    if (count / total >= minShare) significant += 1;
    if (count > dominant) dominant = count;
  }
  return { significant, dominantShare: total === 0 ? 0 : dominant / total };
}

/** 平均池化縮圖到 `size`×`size` 灰階（spectral residual 的標準前處理是 64×64）。 */
export function downsampleGray(image, size) {
  const { width, height } = image;
  const gray = toGray(image);
  const out = new Float64Array(size * size);
  for (let gy = 0; gy < size; gy += 1) {
    const y0 = Math.floor((gy * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / size));
    for (let gx = 0; gx < size; gx += 1) {
      const x0 = Math.floor((gx * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / size));
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) sum += gray[y * width + x];
      }
      out[gy * size + gx] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** 就地 1D 複數 FFT（radix-2，長度必須是 2 的冪）。inverse 時不除以 n。 */
function fft1d(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/** 2D FFT：先逐列再逐行。 */
export function fft2d(re, im, size, inverse = false) {
  const rowRe = new Float64Array(size);
  const rowIm = new Float64Array(size);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let a = 0; a < size; a += 1) {
      for (let b = 0; b < size; b += 1) {
        const idx = pass === 0 ? a * size + b : b * size + a;
        rowRe[b] = re[idx];
        rowIm[b] = im[idx];
      }
      fft1d(rowRe, rowIm, inverse);
      for (let b = 0; b < size; b += 1) {
        const idx = pass === 0 ? a * size + b : b * size + a;
        re[idx] = rowRe[b];
        im[idx] = rowIm[b];
      }
    }
  }
}

function boxBlur(values, size, radius) {
  const out = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const yy = Math.min(size - 1, Math.max(0, y + dy));
          const xx = Math.min(size - 1, Math.max(0, x + dx));
          sum += values[yy * size + xx];
          count += 1;
        }
      }
      out[y * size + x] = sum / count;
    }
  }
  return out;
}

/**
 * Spectral residual 顯著性圖（64×64，總和正規化為 1）：
 * L = log|F|；R = L − 3×3 平均(L)；S = 平滑(|F⁻¹(exp(R + iφ))|²)。
 * 平滑用兩次 3×3 box blur 近似高斯。
 */
export function spectralResidualSaliency(image, size = 64) {
  const gray = downsampleGray(image, size);
  const re = Float64Array.from(gray);
  const im = new Float64Array(size * size);
  fft2d(re, im, size);
  const logAmp = new Float64Array(size * size);
  const phase = new Float64Array(size * size);
  for (let i = 0; i < size * size; i += 1) {
    logAmp[i] = Math.log(Math.hypot(re[i], im[i]) + 1e-9);
    phase[i] = Math.atan2(im[i], re[i]);
  }
  const avg = boxBlur(logAmp, size, 1);
  for (let i = 0; i < size * size; i += 1) {
    const r = Math.exp(logAmp[i] - avg[i]);
    re[i] = r * Math.cos(phase[i]);
    im[i] = r * Math.sin(phase[i]);
  }
  fft2d(re, im, size, true);
  let map = new Float64Array(size * size);
  for (let i = 0; i < size * size; i += 1) map[i] = re[i] ** 2 + im[i] ** 2;
  map = boxBlur(boxBlur(map, size, 1), size, 1);
  const total = map.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < map.length; i += 1) map[i] /= total;
  return { size, map };
}

/** 矩形（視窗座標）內的顯著性佔比；矩形依視窗尺寸換算到顯著性網格。 */
export function saliencyShare(saliency, rect, viewport) {
  const { size, map } = saliency;
  const x0 = Math.max(0, Math.floor((rect.left / viewport.width) * size));
  const x1 = Math.min(size, Math.ceil((rect.right / viewport.width) * size));
  const y0 = Math.max(0, Math.floor((rect.top / viewport.height) * size));
  const y1 = Math.min(size, Math.ceil((rect.bottom / viewport.height) * size));
  let sum = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) sum += map[y * size + x];
  }
  const area = ((x1 - x0) * (y1 - y0)) / (size * size);
  // 佔比除以面積比 = 每單位面積的顯著程度（>1 代表比平均更搶眼）。
  return { share: sum, lift: area > 0 ? sum / area : 0 };
}

/** 顯著性圖池化成 `grid`×`grid` 後的 Shannon 熵（位元）；越低代表注意力越集中。 */
export function attentionEntropy(saliency, grid = 16) {
  const { size, map } = saliency;
  const cells = new Float64Array(grid * grid);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      cells[
        Math.floor((y * grid) / size) * grid + Math.floor((x * grid) / size)
      ] += map[y * size + x];
    }
  }
  let entropy = 0;
  for (const p of cells) if (p > 0) entropy -= p * Math.log2(p);
  return entropy;
}
