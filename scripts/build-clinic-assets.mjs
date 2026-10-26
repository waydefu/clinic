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
  // 2026-10-12 業主換圖：止鼾五合一與鼻中隔手術改用業主以 AI 工具產生的水彩插圖
  // （權利依據見 manifest 的 additionalLicences）。舊來源 service-snoring-symptoms.jpg
  // 與 service-septoplasty.jpg 已移除，需要時從 git 歷史取回。
  snoring: 'service-snoring-open-mouth.webp',
  turbinate: 'service-turbinate.jpg',
  septoplasty: 'service-septoplasty-fatigue.webp',
  mouthguard: 'service-mouthguard.webp'
};

// 四張療程圖共用的底色。2026-10-12 的兩張插圖是透明底（約四成畫面透明），卡片與
// 內頁主圖都用 cover 填滿 4:3 框，透明處會透出區塊底色而像缺角，所以先鋪底色再畫；
// 下鼻甲與牙套改成整圓取出後也放在這個底色上。顏色原本量自那兩張投影片右側的底色
// rgb(237 238 219)。
const SERVICE_PAPER = 'rgb(237 238 219)';

// 置中裁切最多容許丟掉多少來源面積。超過就必須宣告 `focus`，否則建置失敗。
//
// 12% 不是理論值，是照現況資料訂的：兩張醫師照本來就適合置中裁（丟 4.3% 與 8.9%），
// 四張療程圖本來就被切壞（丟 25%～63.4%）。門檻放在兩者之間，讓正確的留在線下、
// 壞掉的落在線上。日後若有正常素材誤擋，調的是這個數字，而不是把檢查拿掉——
// 沉默放行正是那四張圖壞掉、而五道 gate 依然全綠的原因。
const MAX_BLIND_DISCARD = 0.12;

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
  // 醫師照：最大的顯示位置是醫師個人頁的 `.clinic-doctor-profile__image`（1440 寬時
  // 約 514px，`aspect-ratio: 4 / 4.2`）；醫師團隊卡片更小。760 約是 1.5 倍——doctor-yan
  // 原圖只有 825px 寬，2 倍會變成放大既有像素，那只會讓檔案變大而不會變清楚。
  // （2026-10-12 前這裡依的是已刪除的 `.clinic-card-grid--doctors`，數字隨之更新。）
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
  // 療程圖：首頁服務列的縮圖是 7rem 寬；最大的顯示位置是療程內頁的
  // `.clinic-service-hero__image`（1440 寬時約 522px，`aspect-ratio: 4 / 3`）。
  // （2026-10-12 前這裡依的是已刪除的 `.clinic-card-grid--services`。）
  //
  // 下鼻甲與牙套兩張來源是 2560×1440 的行銷投影片（2026-10-12 之前鼻中隔也是）：
  // 標題與內文排在左半、插圖排在右半、品牌標誌在右上。置中裁到 4:3 會從兩側各切掉
  // 320px，正好切在標題上——
  // 「下鼻甲手術」→「鼻甲手術」、「好眠牙套」→「子眠牙套」。
  //
  // 因此裁到**只取右側插圖**：投影片上的標題與內文本來就與卡片自己的 title／
  // subtitle 重複（而且「好眠牙套」與 clinic-content.js 的「止鼾好眠牙套」不一致），
  // 拿掉它反而讓文字回到 HTML，符合 WCAG 1.4.5。
  //
  // cx／cy 是焦點在來源上的位置比例，halfW 是以來源寬度為單位的半寬。左界的
  // 決定條件是量出來的：內文最右緣 turbinate 在 x≈0.560、mouthguard 在 x≈0.635，
  // 裁切框左界必須大於它，否則會漏出殘字。
  {
    source: SERVICE_SOURCES.turbinate,
    output: 'service-turbinate.webp',
    width: 540,
    aspect: 4 / 3,
    // 2026-10-12：右側插圖是一個直徑約 860px 的圓，比文字右緣以右能裁出的 4:3 框
    // 還高，舊的 focus 裁法會切掉圓的上下緣，看起來像被剪壞。改成沿圓周整個剪下、
    // 放在與另外三張相同的底色上。圓心與半徑是在圓周上取 180 條射線、以最小平方法
    // 擬合出來的（殘差中位數 0.3px）。
    disc: { x: 1985.3, y: 882.5, r: 430.2, height: 0.86 },
    background: SERVICE_PAPER,
    quality: 0.78
  },
  {
    source: SERVICE_SOURCES.septoplasty,
    output: 'service-septoplasty.webp',
    width: 540,
    aspect: 4 / 3,
    // 來源是直式 1072×1467（桌前揉眼的人物，下方是水瓶、紙與筆），裁成 4:3 一定
    // 會丟掉約 45%。保留頭部、揉眼的手與肩膀：取全寬，上緣 y≈100（頭髮從 y≈178
    // 開始），下緣 y≈904，剛好停在水瓶蓋（y≈915）之前，不留半截瓶蓋。
    focus: { cx: 0.5, cy: 0.342, halfW: 0.5 },
    background: SERVICE_PAPER,
    // 水彩紙紋很吃位元組：0.78 是 17.2 KiB，0.62 是 13.5 KiB，肉眼比對看不出差別。
    quality: 0.62
  },
  {
    source: SERVICE_SOURCES.mouthguard,
    output: 'service-mouthguard.webp',
    width: 540,
    aspect: 4 / 3,
    // 同上：灰色圓直徑約 845px，舊裁法切掉圓的左下。牙套線稿整個在圓內。
    disc: { x: 2088.6, y: 897.9, r: 422.8, height: 0.86 },
    background: SERVICE_PAPER,
    quality: 0.78
  },
  // 止鼾五合一：仰睡張口呼吸的人物插圖。「打鼾的五個常見成因」自 2026-08-07 起以
  // HTML 呈現（`clinic-content.js`），卡片圖只放插圖、不含文字。
  {
    source: SERVICE_SOURCES.snoring,
    output: 'service-snoring.webp',
    width: 540,
    aspect: 4 / 3,
    // 來源 1536×1024（3:2）的頭髮頂端在 y≈28，裁成 4:3 時頭頂貼著上緣、手肘與枕頭
    // 被切掉，看起來像被剪壞（業主要求療程縮圖不要有被切的感覺）。改成不裁切：整張
    // 放進 4:3、靠下對齊，上方約 11% 由底色補上。
    letterbox: 'bottom',
    background: SERVICE_PAPER,
    // 水彩紙紋很吃位元組：0.78 與 0.62 肉眼比對看不出差別，取 0.62。
    quality: 0.62
  },
  // 照護卡圖示：`.clinic-care-card__icon` 是 4.1rem＝65.6px，`object-fit: contain`。
  // 這四張本來就只有 4–8 KiB，轉檔省下的不多，但留著 PNG 會讓 clinic-assets 同時
  // 存在兩種格式，之後很容易有人照著舊的那種加圖。
  ...['listening', 'treatment', 'environment', 'aftercare'].map((slug) => ({
    source: `care-${slug}.png`,
    output: `care-${slug}.webp`,
    width: 132,
    quality: 0.85
  })),
  // 2026-10-11 首頁改版：品牌牆是首屏主圖，橫跨整個視窗寬（設計基準 1440px）。
  // 來源只有 2560px 寬，2 倍會超過原圖，所以取 1920（1.33 倍）。牆面紋理在品質
  // 0.7 下仍清楚，實測 35.9 KiB；手機用同一檔以 object-position 改成直式構圖。
  // 來源：官網 2025/06/1-1-scaled-1.webp（sha256 29354ee11aa1…）。
  {
    source: 'home-brand-wall.webp',
    output: 'home-brand-wall.webp',
    width: 1920,
    aspect: 16 / 9,
    quality: 0.7
  },
  // 首頁「診所空間」相簿：主圖約佔 shell 的 2/3（約 760px），1280 為 1.68 倍。
  // 16:10 從 16:9 原圖只裁掉 10% 寬，低於 MAX_BLIND_DISCARD。四張合計實測約 96 KiB。
  // 來源依序為官網 2025/06/4-1-1-scaled-1.webp、2025/02/5-1-1.jpg、
  // 2025/06/3-1-scaled-1.webp、2025/02/6-1.jpg；2-1（診桌照）未選用。
  ...[
    ['reception', 'webp'],
    ['lounge', 'jpg'],
    ['consult', 'webp'],
    ['treatment', 'jpg']
  ].map(([slug, extension]) => ({
    source: `home-space-${slug}.${extension}`,
    output: `home-space-${slug}.webp`,
    width: 1280,
    aspect: 16 / 10,
    quality: 0.6
  }))
];

/**
 * 把一張圖裁到目標比例、縮到目標寬度，編成 WebP。
 *
 * 裁切預設置中，主體不在中央時要在 TARGETS 補 `focus` 明確指定裁切框——不是把這裡
 * 改成某種自動偵測，猜錯的裁切比沒裁還糟。
 *
 * 2026-08-07：這段註解原本只是建議，四張療程圖沒有人照做，於是被置中裁切默默切掉
 * 25～63% 的畫面（標題「止鼾好眠牙套」被切成「子眠牙套」）。現在 main() 有一道
 * fail-closed 門檻會強制執行它，見 MAX_BLIND_DISCARD。
 *
 * `letterbox: 'bottom'` 是另一條路：完全不裁切，整張縮進目標比例後靠下對齊，空出來的
 * 部分由 `background` 補上。只適合透明底或底色單純的插圖，照片會留下一條色帶。
 *
 * `disc` 則是把來源上一個圓形插圖整個取出來：以 { x, y, r }（來源像素，量測方式見
 * TARGETS 的註解）沿圓周剪下，置中放在 `background` 上，直徑佔畫面高度的 `height`。
 * 剪的半徑比量到的小 1.5px，避免把圓外的投影片底色一起帶進來。
 */
async function encode(
  page,
  { dataUri, trim, width, aspect, focus, letterbox, disc, background, quality }
) {
  return page.evaluate(
    async ({
      uri,
      trimMode,
      targetWidth,
      targetAspect,
      focusBox,
      letterboxAlign,
      discCircle,
      fill,
      encodeQuality
    }) => {
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

      const trimmed = { width: box.width, height: box.height };
      let discardRatio = 0;

      if (discCircle) {
        const radius = discCircle.r - 1.5;
        box = {
          x: discCircle.x - radius,
          y: discCircle.y - radius,
          width: radius * 2,
          height: radius * 2
        };
      }
      // 這兩種模式都不裁主體，多出來的空間在下面由底色補上。
      const keepWhole = Boolean(letterboxAlign || discCircle);

      if (typeof targetAspect === 'number') {
        const sourceAspect = box.width / box.height;
        // 置中裁切會丟掉多少：兩個比例的比值就是保留的面積比例。
        discardRatio = keepWhole
          ? 0
          : 1 -
            Math.min(sourceAspect, targetAspect) /
              Math.max(sourceAspect, targetAspect);

        if (keepWhole) {
          // 不裁切。
        } else if (focusBox) {
          // 具名裁切框：主體不在畫面中央時走這條。halfW 是「以來源寬度為單位的
          // 半寬」，高度由目標比例決定，最後把框夾回畫布內，不容許超出邊界。
          let cropWidth = focusBox.halfW * 2 * box.width;
          let cropHeight = cropWidth / targetAspect;
          if (cropHeight > box.height) {
            cropHeight = box.height;
            cropWidth = cropHeight * targetAspect;
          }
          box = {
            x: Math.max(
              box.x,
              Math.min(
                box.x + box.width - cropWidth,
                box.x + focusBox.cx * box.width - cropWidth / 2
              )
            ),
            y: Math.max(
              box.y,
              Math.min(
                box.y + box.height - cropHeight,
                box.y + focusBox.cy * box.height - cropHeight / 2
              )
            ),
            width: cropWidth,
            height: cropHeight
          };
        } else if (sourceAspect > targetAspect) {
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
      canvas.height = Math.round(
        outputWidth / (keepWhole ? targetAspect : box.width / box.height)
      );
      let destination = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      };
      if (discCircle) {
        const size = canvas.height * discCircle.height;
        destination = {
          x: (canvas.width - size) / 2,
          y: (canvas.height - size) / 2,
          width: size,
          height: size
        };
      } else if (letterboxAlign) {
        const scale = Math.min(
          canvas.width / box.width,
          canvas.height / box.height
        );
        const drawWidth = box.width * scale;
        const drawHeight = box.height * scale;
        destination = {
          x: (canvas.width - drawWidth) / 2,
          y:
            letterboxAlign === 'bottom'
              ? canvas.height - drawHeight
              : (canvas.height - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight
        };
      }
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      if (fill) {
        context.fillStyle = fill;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (discCircle) {
        context.save();
        context.beginPath();
        context.arc(
          destination.x + destination.width / 2,
          destination.y + destination.height / 2,
          destination.width / 2,
          0,
          Math.PI * 2
        );
        context.clip();
      }
      context.drawImage(
        image,
        box.x,
        box.y,
        box.width,
        box.height,
        destination.x,
        destination.y,
        destination.width,
        destination.height
      );
      if (discCircle) context.restore();
      return {
        dataUrl: canvas.toDataURL('image/webp', encodeQuality),
        width: canvas.width,
        height: canvas.height,
        discardRatio,
        trimmed,
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
      focusBox: focus ?? null,
      letterboxAlign: letterbox ?? null,
      discCircle: disc ?? null,
      fill: background ?? null,
      encodeQuality: quality
    }
  );
}

export async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const sourceDir = join(repoRoot, 'apps', 'web', 'clinic-source');
  const outputDir = join(repoRoot, 'apps', 'web', 'public', 'clinic-assets');
  mkdirSync(outputDir, { recursive: true });

  const entries = [];
  let sourceBytes = 0;
  let outputBytes = 0;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');

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
        focus: target.focus,
        letterbox: target.letterbox,
        disc: target.disc,
        background: target.background,
        quality: target.quality
      });

      if (!encoded.dataUrl.startsWith('data:image/webp')) {
        throw new Error(`${target.output}: 瀏覽器沒有輸出 WebP`);
      }

      // fail-closed：丟太多又沒指定裁切框就擋下來，並直接說要補什麼。
      if (!target.focus && encoded.discardRatio > MAX_BLIND_DISCARD) {
        const percent = (encoded.discardRatio * 100).toFixed(1);
        const limit = (MAX_BLIND_DISCARD * 100).toFixed(0);
        throw new Error(
          `${target.output}: 置中裁切會丟掉來源的 ${percent}%（上限 ${limit}%）。\n` +
            `  來源 ${encoded.trimmed.width}×${encoded.trimmed.height}` +
            `（比例 ${(encoded.trimmed.width / encoded.trimmed.height).toFixed(2)}:1）` +
            `，目標比例 ${target.aspect.toFixed(2)}:1。\n` +
            `  這代表主體不可能同時留在畫面裡。請在 TARGETS 的這一筆補上 focus：\n` +
            `    focus: { cx: 0.5, cy: 0.5, halfW: 0.25 }  // 依實際主體位置調整\n` +
            `  cx／cy 是焦點在來源上的位置比例，halfW 是以來源寬度為單位的半寬。`
        );
      }

      // 來源解析度不足以填滿目標寬度時，卡片在 Retina 下會糊。這不擋建置，但要講。
      if (encoded.width < target.width) {
        process.stderr.write(
          `警告：${target.output} 只輸出到 ${encoded.width}px，` +
            `低於目標 ${target.width}px——來源解析度不足，Retina 下會模糊。\n`
        );
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
  } finally {
    await browser.close();
  }

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
      scope:
        '2026-08-02 確認當時本 manifest 已列出的素材，用於本專案的診所官網；無期限限制。' +
        '之後加入或替換的素材不適用本筆（包括 origin 與 licenceStatus），各以 additionalLicences 逐檔記錄'
    },
    // 2026-08-02 那次確認只涵蓋當時列出的素材。之後加入的每一批都在這裡逐檔列出
    // 自己的確認，不借用上面那一筆。
    additionalLicences: [
      {
        files: [
          'apps/web/clinic-source/home-brand-wall.webp',
          'apps/web/clinic-source/home-space-reception.webp',
          'apps/web/clinic-source/home-space-lounge.jpg',
          'apps/web/clinic-source/home-space-consult.webp',
          'apps/web/clinic-source/home-space-treatment.jpg'
        ],
        origin: 'beauessence.com.tw',
        basis: '診所自有（自行拍攝或委製，著作權屬一森渼診所）',
        confirmedBy: 'wayde.fu',
        confirmedOn: '2026-10-12',
        scope: '用於本專案的診所官網；無期限限制'
      },
      {
        files: [
          'apps/web/clinic-source/service-snoring-open-mouth.webp',
          'apps/web/clinic-source/service-septoplasty-fatigue.webp'
        ],
        origin: '業主提供',
        basis: '業主以 AI 工具產生，業主確認可用於診所官網',
        confirmedBy: 'wayde.fu',
        confirmedOn: '2026-10-12',
        scope: '用於本專案的診所官網',
        openItem: '上線前再確認所用 AI 工具的商用條款'
      },
      {
        // 2026-10-12 器材與牙套照片同樣不經過本腳本，去背流程記在設計紀錄。
        files: [
          'apps/web/clinic-source/device-bipolar-rf.png',
          'apps/web/clinic-source/device-coagulation-forceps.png',
          'apps/web/clinic-source/mouthguard-photo.png'
        ],
        origin:
          '業主提供（官網投影片「雙極射頻／微創止鼾凝結消融」與「客製化專屬於您的牙套」，2026-10-12 對話中提供）',
        basis:
          '業主指示使用；只去背取出器材與牙套本身，不含投影片上的文字、皇冠與標章',
        confirmedBy: 'wayde.fu',
        confirmedOn: '2026-10-12',
        scope: '下鼻甲手術頁的器材卡片與止鼾好眠牙套頁的實品照',
        openItem: '上線前確認器材照片是否為廠商產品照、可否用於診所官網'
      },
      {
        // 2026-10-12 首頁地圖不經過本腳本的編碼流程，但權利紀錄集中在這裡。
        files: [
          'apps/web/public/clinic-assets/visit-map.svg',
          'apps/web/public/clinic-assets/visit-map-compact.svg'
        ],
        origin:
          'OpenStreetMap（scripts/build-visit-map.mjs 以 Overpass 匯出的道路、捷運站與公園資料繪製）',
        basis:
          'OpenStreetMap 資料採 ODbL 1.0；繪成的地圖屬產出作品（Produced Work），只須標示「© OpenStreetMap 貢獻者」並連到 https://www.openstreetmap.org/copyright',
        confirmedBy: '依授權條款（不需業主另行確認）',
        confirmedOn: '2026-10-12',
        scope:
          '首頁「門診時間與交通」的預設地圖（桌機寬版與手機近距離版）；頁面以 .clinic-visit__credit 標示來源'
      }
    ],
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
