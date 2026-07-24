import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 品牌資產產生器。
//
// 來源是設計方給的高解析 PNG（`apps/web/brand-source/`，不會出貨）。這個腳本把
// 它們裁切、縮到實際顯示尺寸的 2 倍，再編成 WebP 寫進 `apps/web/public/assets/`。
// 產物**有進版控**，所以正式建置不需要瀏覽器；只有換 logo 時才需要重跑。
//
// 為什麼不直接放原圖：影像預算是每頁 5 KiB。2048×1146 的 PNG 是 143 KiB，
// 用 CSS 縮到 40px 顯示等於讓每個訪客下載 3500 倍於所需的像素。
//
// 為什麼是 WebP 而不是 SVG：兩張都是點陣稿，沒有向量原始檔。把官方標章描邊重畫
// 是不行的——健保署署徽必須原樣重現。品牌 logo 雖然是線稿，描邊也會失真。
//
// 為什麼是 2 倍而不是 3 倍：實測 3 倍只多出不到 1 KiB 的視覺差異，但兩張加起來
// 就會擠掉預算。2 倍在 Retina 上已經足夠銳利。

const TARGETS = [
  {
    // 標誌本體：鼻形側臉＋植物。字標留給 HTML 文字，不做進圖裡——那樣可選取、
    // 可翻譯、可搜尋，而且在深色主題下會自己跟著 --ink 走。
    //
    // 裁切框來自實測墨跡邊界：標誌與字標之間有一道 115px 寬的空白帶（x828–942），
    // 從那裡切開，兩邊都不會被削到。
    source: 'brand-lockup.png',
    output: 'brand-mark.webp',
    crop: { x: 102, y: 59, width: 727, height: 1027 },
    height: 80,
    quality: 0.85
  },
  {
    // 健保特約標章。官方標章不裁切、不改色、不變形——等比縮放是唯一允許的處理。
    source: 'nhi-mark.png',
    output: 'nhi-mark.webp',
    crop: null,
    height: 64,
    quality: 0.8
  }
];

export function scaledSize(crop, targetHeight) {
  const ratio = crop.width / crop.height;
  return {
    width: Math.round(targetHeight * ratio),
    height: targetHeight
  };
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const sourceDir = join(repoRoot, 'apps', 'web', 'brand-source');
  const outputDir = join(repoRoot, 'apps', 'web', 'public', 'assets');
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  for (const target of TARGETS) {
    const bytes = readFileSync(join(sourceDir, target.source));
    const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;

    const encoded = await page.evaluate(
      async ({ uri, crop, height, quality }) => {
        const image = new Image();
        image.src = uri;
        await image.decode();
        const box = crop ?? {
          x: 0,
          y: 0,
          width: image.naturalWidth,
          height: image.naturalHeight
        };
        const ratio = box.width / box.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(height * ratio);
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(
          image,
          box.x,
          box.y,
          box.width,
          box.height,
          0,
          0,
          canvas.width,
          canvas.height
        );
        return {
          dataUrl: canvas.toDataURL('image/webp', quality),
          width: canvas.width,
          height: canvas.height
        };
      },
      {
        uri: dataUri,
        crop: target.crop,
        height: target.height,
        quality: target.quality
      }
    );

    if (!encoded.dataUrl.startsWith('data:image/webp')) {
      throw new Error(`${target.output}: 瀏覽器沒有輸出 WebP`);
    }
    const output = Buffer.from(encoded.dataUrl.split(',')[1], 'base64');
    writeFileSync(join(outputDir, target.output), output);
    console.log(
      `${target.output}: ${encoded.width}×${encoded.height}, ${(output.length / 1024).toFixed(2)} KiB (來源 ${(bytes.length / 1024).toFixed(0)} KiB)`
    );
  }

  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
