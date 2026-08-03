import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 診所官網素材產生器。
//
// 來源是從官網取回的原始 PNG／JPG（`apps/web/clinic-source/`，不會出貨）。這個
// 腳本把每一張裁到實際顯示的比例、縮到顯示尺寸的 2 倍，再編成 WebP 寫進
// `apps/web/public/clinic-assets/`。產物**有進版控**，正式建置不需要瀏覽器。
//
// 為什麼需要它：原始素材 12 張共 2.2 MB，而當時 `/clinic.html` 的影像預算是
// 560 KiB。這是 2026-07-27 業主需求批次 C2 的兩個阻擋條件之一（另一個是圖片
// 授權，那要業主自己確認，不是這裡能解的）。壓完是 129 KiB，預算同日改為
// 180 KiB／14 檔。
//
// 為什麼沿用 `build-brand-assets.mjs` 的 Playwright canvas 而不是裝 sharp：
// 這個 repo 已經有 Playwright，而 sharp 帶 native binary、要為每個平台各拉一份
// 預編譯檔。多一個供應鏈相依只為了縮圖，代價不對稱。缺點是編碼品質由瀏覽器決定
// 而非 libwebp 參數，所以下面的 quality 是實測調出來的，不是理論值。
//
// 為什麼不是 AVIF：Chromium 的 canvas 不編 AVIF，`toDataURL('image/avif')` 會
// 默默退回 PNG。WebP 已經把 2.2 MB 壓到 1/6，再往下的邊際效益不值得多一套工具。

// 療程圖從官網抓回來時是三種格式混著（PNG／JPG／WebP），輸出統一成 WebP，所以
// 來源檔名要另外對照。
const SERVICE_SOURCES = {
  snoring: 'service-snoring.png',
  turbinate: 'service-turbinate.jpg',
  septoplasty: 'service-septoplasty.jpg',
  mouthguard: 'service-mouthguard.webp'
};

// 每張的目標尺寸都是 **CSS 顯示尺寸的 2 倍**（Retina），顯示尺寸取自
// clinic-site.css 的實際規則，註解裡標出是哪一條。
const TARGETS = [
  {
    // `.clinic-brand img` 最寬 12.5rem＝200px，頁尾同寬。
    //
    // 原圖 1536×860 四周有大片透明留白，所以先依 alpha 邊界裁掉（實測墨跡
    // 1384×771）——那正是 clinic.html 上原本的 `width="420" height="131"` 與檔案
    // 本身 1.79:1 對不起來的原因：屬性寫的是墨跡比例，瀏覽器讀到的卻是含留白的
    // 整張，載入前後兩個比例不同就是一次版面跳動。裁掉留白之後兩者才是同一個
    // 比例，屬性也同步改成 400×223。
    source: 'clinic-logo.png',
    output: 'clinic-logo.webp',
    trim: 'alpha',
    width: 400,
    quality: 0.85
  },
  {
    // `.clinic-care-section` 的底圖，上面壓著 90–92% 不透明的色塊。
    //
    // 它幾乎看不見，所以這裡壓得比別張兇：品質 0.5、寬度只取 800。cover 到寬
    // 螢幕會放大，但隔著那層色塊看不出來。415 KiB 換 20 KiB 上下的裝飾底色是
    // 這批裡最划算的一筆。
    source: 'soft-green-bg.png',
    output: 'soft-green-bg.webp',
    width: 800,
    quality: 0.5
  },
  // 醫師照：`.clinic-card-grid--doctors` 最寬 54rem／2 欄，扣掉 2rem gap 後每張
  // 約 416px，`aspect-ratio: 4 / 4.2`。760 是 1.83 倍——doctor-yan 原圖只有
  // 825px 寬，2 倍會變成放大既有像素，那只會讓檔案變大而不會變清楚。
  {
    source: 'doctor-yan.png',
    output: 'doctor-yan.webp',
    width: 760,
    aspect: 4 / 4.2,
    quality: 0.76
  },
  {
    source: 'doctor-yang.png',
    output: 'doctor-yang.webp',
    width: 760,
    aspect: 4 / 4.2,
    quality: 0.76
  },
  // 療程卡：`.clinic-card-grid--services` 4 欄，shell 最寬 73rem，扣掉 3 道
  // 2rem gap 後每張約 268px，`aspect-ratio: 4 / 3`。
  ...['snoring', 'turbinate', 'septoplasty', 'mouthguard'].map((slug) => ({
    source: SERVICE_SOURCES[slug],
    output: `service-${slug}.webp`,
    width: 540,
    aspect: 4 / 3,
    quality: 0.78
  })),
  // 照護卡圖示：`.clinic-care-card__icon` 是 4.1rem＝65.6px，`object-fit: contain`。
  // 這四張本來就只有 4–8 KiB，轉檔省下的不多，但留著 PNG 會讓 clinic-assets 同時
  // 存在兩種格式，之後很容易有人照著舊的那種加圖。
  ...['listening', 'treatment', 'environment', 'aftercare'].map((slug) => ({
    source: `care-${slug}.png`,
    output: `care-${slug}.webp`,
    width: 132,
    quality: 0.85
  }))
];

/**
 * 把一張圖裁到目標比例、縮到目標寬度，編成 WebP。
 *
 * 裁切一律置中：這批素材的主體（人像、器械、環境）都在畫面中央，置中裁不會切掉
 * 重點。若日後有主體偏一邊的圖，要在 TARGETS 裡補一個明確的裁切框，而不是把這裡
 * 改成某種自動偵測——猜錯的裁切比沒裁還糟。
 */
async function encode(page, { dataUri, trim, width, aspect, quality }) {
  return page.evaluate(
    async ({ uri, trimMode, targetWidth, targetAspect, encodeQuality }) => {
      const image = new Image();
      image.src = uri;
      await image.decode();

      let box = {
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight
      };

      if (trimMode === 'alpha') {
        // 量墨跡邊界：把原圖畫進離屏 canvas，找出 alpha 不為 0 的最小外框。
        const probe = document.createElement('canvas');
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const probeContext = probe.getContext('2d', {
          willReadFrequently: true
        });
        probeContext.drawImage(image, 0, 0);
        const { data } = probeContext.getImageData(
          0,
          0,
          probe.width,
          probe.height
        );
        let minX = probe.width;
        let minY = probe.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < probe.height; y += 1) {
          for (let x = 0; x < probe.width; x += 1) {
            // 門檻取 8 而不是 0：JPEG 來源轉存成 PNG 常留下一圈幾乎全透明的雜訊，
            // 用 0 當門檻會把那圈也算成墨跡，等於沒裁。
            if (data[(y * probe.width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          box = {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
          };
        }
      }

      if (typeof targetAspect === 'number') {
        const sourceAspect = box.width / box.height;
        if (sourceAspect > targetAspect) {
          const cropped = box.height * targetAspect;
          box = {
            x: box.x + (box.width - cropped) / 2,
            y: box.y,
            width: cropped,
            height: box.height
          };
        } else {
          const cropped = box.width / targetAspect;
          box = {
            x: box.x,
            y: box.y + (box.height - cropped) / 2,
            width: box.width,
            height: cropped
          };
        }
      }

      // 不放大：目標寬度超過裁切後的原始寬度時，就以原始寬度為準。放大只會讓檔案
      // 變大而畫面不會更清楚。
      const outputWidth = Math.min(targetWidth, Math.round(box.width));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = Math.round(outputWidth / (box.width / box.height));
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
        dataUrl: canvas.toDataURL('image/webp', encodeQuality),
        width: canvas.width,
        height: canvas.height,
        box: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height)
        }
      };
    },
    {
      uri: dataUri,
      trimMode: trim ?? null,
      targetWidth: width,
      targetAspect: aspect ?? null,
      encodeQuality: quality
    }
  );
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const sourceDir = join(repoRoot, 'apps', 'web', 'clinic-source');
  const outputDir = join(repoRoot, 'apps', 'web', 'public', 'clinic-assets');
  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  const entries = [];
  let sourceBytes = 0;
  let outputBytes = 0;

  for (const target of TARGETS) {
    const bytes = readFileSync(join(sourceDir, target.source));
    const mime = target.source.endsWith('.png')
      ? 'image/png'
      : target.source.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    const encoded = await encode(page, {
      dataUri: `data:${mime};base64,${bytes.toString('base64')}`,
      trim: target.trim,
      width: target.width,
      aspect: target.aspect,
      quality: target.quality
    });

    if (!encoded.dataUrl.startsWith('data:image/webp')) {
      throw new Error(`${target.output}: 瀏覽器沒有輸出 WebP`);
    }
    const output = Buffer.from(encoded.dataUrl.split(',')[1], 'base64');
    writeFileSync(join(outputDir, target.output), output);

    sourceBytes += bytes.length;
    outputBytes += output.length;
    entries.push({
      output: `/clinic-assets/${target.output}`,
      width: encoded.width,
      height: encoded.height,
      bytes: output.length,
      sha256: createHash('sha256').update(output).digest('hex'),
      source: {
        file: `apps/web/clinic-source/${target.source}`,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')
      }
    });

    console.log(
      `${target.output.padEnd(24)} ${String(encoded.width).padStart(4)}×${String(
        encoded.height
      ).padEnd(
        4
      )} ${((output.length / 1024).toFixed(1) + ' KiB').padStart(10)}` +
        `  (來源 ${(bytes.length / 1024).toFixed(0)} KiB` +
        `${target.trim === 'alpha' ? `，墨跡 ${encoded.box.width}×${encoded.box.height}` : ''})`
    );
  }

  await browser.close();

  // 授權不是這個腳本算得出來的東西，所以它是一組**寫死的宣告**，改動必須是一次
  // 有名有據的決定，而不是跟著重跑而變。腳本負責的是可驗證的那一半——檔案、位元組
  // 數與雜湊——讓這份宣告有明確的對象可指：`assets[].sha256` 就是被宣告的那幾張圖。
  //
  // 2026-08-02 之前這裡是 `pending-owner-confirmation`。C2 的兩個阻擋條件裡，壓縮
  // 那一半由這支腳本解決，授權那一半只能由人回答；當天取得確認後改為 `owned`。
  //
  // 若日後換圖或加圖，**先確認新素材的權利基礎再改這裡**。沿用舊宣告涵蓋新檔案，
  // 等於用一次舊的確認替沒有被確認過的東西背書。
  const manifest = {
    generatedBy: 'scripts/build-clinic-assets.mjs',
    origin: 'beauessence.com.tw',
    licenceStatus: 'owned',
    licence: {
      basis: '診所自有（自行拍攝或委製，著作權屬一森渼診所）',
      confirmedBy: 'wayde.fu',
      confirmedOn: '2026-08-02',
      scope: '本 manifest 列出的素材，用於本專案的診所官網；無期限限制'
    },
    totals: { sourceBytes, outputBytes },
    assets: entries
  };
  writeFileSync(
    join(repoRoot, 'apps', 'web', 'clinic-assets.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log(
    `\n合計 ${(sourceBytes / 1024).toFixed(0)} KiB → ${(
      outputBytes / 1024
    ).toFixed(1)} KiB（${((1 - outputBytes / sourceBytes) * 100).toFixed(1)}%）`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
