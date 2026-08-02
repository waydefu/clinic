import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
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
//
// 2026-08-02 起這裡也產 Open Graph 分享圖。它和上面兩張的取捨完全不同——不縮圖、
// 不進頁面預算、編成 JPEG——理由寫在該筆 target 上。

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
  },
  {
    // Open Graph 分享圖。1200×630 是 Facebook／LinkedIn／X 都吃的尺寸，來源本來
    // 就是這個大小，所以這裡**不縮圖**，只是重新編碼。
    //
    // 為什麼改 JPEG：原始的 806 KiB PNG 是全專案最大的出貨檔。這張圖是平滑漸層
    // 加文字，相異顏色 24420 種——漸層正好打死 PNG 的逐列過濾，PNG 對它毫無勝算。
    // 實測（2026-08-02）把同一張圖用 canvas 重編 PNG 是 981 KiB，**比原檔更大**：
    // 想留在 PNG 就得引入 pngquant／oxipng 之類的量化器，也就是一個 native
    // 相依——那正是 build-clinic-assets.mjs 為了同一件事否決 sharp 的理由。
    // JPEG q0.9 是 53.7 KiB，同一張圖少掉 93%。
    //
    // 為什麼不是 WebP（實測 q0.8 只要 19.7 KiB）：分享圖的讀者是各家爬蟲，而
    // WebP 在那條路徑上支援不齊。省下的 36 KiB 完全不在訪客的載入路徑上，拿它去
    // 換「某個平台抓不到預覽圖」不划算。JPEG 沒有這個問題。
    //
    // 為什麼 quality 是 0.9 而不是更省的 0.85（39.8 KiB）：這張圖不在任何頁面的
    // 傳輸預算裡（見 check-performance-budget.mjs 的 og:image 排除說明），位元組
    // 壓力本來就弱，所以取捨偏向畫質。實測文字帶 PSNR 0.85→0.9 是 33.5→34.5 dB、
    // 單通道最大誤差 76→62，再往上（0.94）多花 27 KiB 只換 0.8 dB。分享卡最容易
    // 壞的地方就是深色底上的白字與金字振鈴，這 16 KiB 花在那裡。
    //
    // background 不是裝飾：原始 PNG 是 RGBA 而且實測最低 alpha 為 220，也就是帶著
    // 一層沒人要的半透明。平台會把分享圖合成在自己也不告訴你的底色上，那是潛在的
    // 顯示錯誤。JPEG 沒有 alpha，這裡先填品牌深綠再畫，等於把那層壓平成確定的結果。
    source: 'og-booking.png',
    output: 'og-booking.jpg',
    outputDir: ['apps', 'web', 'public'],
    format: 'jpeg',
    background: '#14432f',
    crop: null,
    height: 630,
    quality: 0.9,
    // 這個檔案的合約（尺寸、SHA-256、位元組上限）由 check-web-ui.mjs 依這份
    // metadata 稽核，所以產出後要把量到的值寫回去。
    metadata: 'og-booking.metadata.json'
  }
];

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

    const mime = `image/${target.format ?? 'webp'}`;
    const encoded = await page.evaluate(
      async ({ uri, crop, height, quality, type, background }) => {
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
        if (background) {
          // 先鋪底再畫：JPEG 沒有 alpha 通道，沒鋪底的話瀏覽器會自己挑一個底色
          // （通常是黑），半透明的邊緣就會壓出一圈髒邊。
          context.fillStyle = background;
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
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
          dataUrl: canvas.toDataURL(type, quality),
          width: canvas.width,
          height: canvas.height
        };
      },
      {
        uri: dataUri,
        crop: target.crop,
        height: target.height,
        quality: target.quality,
        type: mime,
        background: target.background ?? null
      }
    );

    // 瀏覽器對認不得的格式是**默默退回 PNG**，不是報錯。少了這一行，一次打錯的
    // format 會安靜地出貨一個副檔名與內容對不起來的檔案。
    if (!encoded.dataUrl.startsWith(`data:${mime}`)) {
      throw new Error(`${target.output}: 瀏覽器沒有輸出 ${mime}`);
    }
    const output = Buffer.from(encoded.dataUrl.split(',')[1], 'base64');
    const destination = target.outputDir
      ? join(repoRoot, ...target.outputDir)
      : outputDir;
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, target.output), output);
    console.log(
      `${target.output}: ${encoded.width}×${encoded.height}, ${(output.length / 1024).toFixed(2)} KiB (來源 ${(bytes.length / 1024).toFixed(0)} KiB)`
    );

    if (target.metadata) {
      // 只覆寫量得出來的欄位。clinicHours 那類「人審過什麼」的敘述留在檔案裡由
      // 人維護——那正是 check-web-ui.mjs 拿來比對的東西，讓產生器改它就等於讓
      // 稽核對象自己填答案。
      const metadataPath = join(sourceDir, target.metadata);
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      writeFileSync(
        metadataPath,
        `${JSON.stringify(
          {
            ...metadata,
            width: encoded.width,
            height: encoded.height,
            bytes: output.length,
            sha256: createHash('sha256').update(output).digest('hex')
          },
          null,
          2
        )}\n`
      );
      console.log(
        `  → ${target.metadata} 已更新（bytes／sha256／尺寸），上限 ${metadata.maxBytes ? `${(metadata.maxBytes / 1024).toFixed(0)} KiB` : '未設'}`
      );
    }
  }

  await browser.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
