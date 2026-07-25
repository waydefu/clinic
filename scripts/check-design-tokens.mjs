import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 設計 token 的把關。
//
// 為什麼需要它：`--text-sm` 曾經被用了五次卻從未定義過。CSS 對這種錯誤是沉默的
// ——整條宣告失效，字級默默退回繼承值，畫面看起來「差不多對」，沒有任何工具會
// 抱怨。同樣沉默的還有：寫死的顏色（於是主題只換一半）、繞過字級尺度的字面值、
// 兩份樣式表各用一套斷點。
//
// 這個腳本把上面每一類都變成建置失敗。
//
// 兩種嚴格度：
//   - **硬性**：已經清零的類別（未定義 token、寫死色、字重、圓角、陰影、斷點）。
//     再出現一個就紅。
//   - **上限（ratchet）**：還有已知債務的類別（離開字級尺度的字面值、離開間距
//     網格的字面值）。數量只能減不能增——把債務攤在檯面上，而不是假裝不存在。
//     收斂它們會改變版面節奏，屬於選定視覺風格時的工作。

const CANONICAL_BREAKPOINTS = new Set(['64rem', '48rem', '30rem']);

// 字級尺度（styles.css 的 --text-* 實際值）加上少數合理的相對單位。
const TYPE_SCALE = new Set([
  '0.875rem',
  '1rem',
  '1.2rem',
  '1.44rem',
  '1.728rem',
  '2.074rem',
  '2.488rem'
]);

const SPACING_GRID = new Set([
  '0.125rem',
  '0.25rem',
  '0.5rem',
  '0.75rem',
  '1rem',
  '1.25rem',
  '1.5rem',
  '2rem',
  '3rem',
  '4rem'
]);

const SPACING_PROPERTIES =
  /\b(?:gap|row-gap|column-gap|padding|padding-top|padding-right|padding-bottom|padding-left|padding-inline|padding-block|margin|margin-top|margin-right|margin-bottom|margin-left|margin-inline|margin-block): ([^;{}]+);/g;

// Design Tokens 2.0 之後這兩類都清零了，因此上限是 0——它們已經是硬性檢查，
// 保留這個結構是為了萬一將來又要開一筆新債務時，有地方把它記下來而不是隱形。
const CEILINGS = {
  'font-size 字面值': 0,
  間距字面值: 0
};

// `em` 字級是相對於父層文字的比例，語意跟字級尺度不同：`.back-arrow` 的箭頭與
// `.slot-chip-mark` 的記號都要跟著所在文字縮放，換成 rem 會切斷那個關係。
const RELATIVE_FONT_SIZE = /^[0-9.]+em$/;

/** 取出所有 `:root...{ }` 區塊裡定義的自訂屬性。 */
export function definedTokens(source) {
  const defined = new Set();
  for (const block of source.matchAll(/:root[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const match of block[1].matchAll(/(--[a-z0-9-]+):/g)) {
      defined.add(match[1]);
    }
  }
  return defined;
}

/** 取出所有 `var(--x)` 的引用。 */
export function usedTokens(source) {
  return [...source.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
}

/** 註解裡的顏色與數字是說明，不是宣告——分析前一律先拿掉。 */
export function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `:root` 區塊以外的內容——寫死顏色只有在這裡才算違規。 */
export function outsideRootBlocks(source) {
  return source.replace(/:root[^{]*\{[\s\S]*?\n\}/g, '');
}

/**
 * 純核心：給定每個樣式表的內容，回傳硬性違規與需要計數的債務。
 *
 * @param sheets Map<檔名, { source, scope }>，scope 是這個檔案可用的 token 集合
 */
export function planTokenReview(sheets) {
  const violations = [];
  const debt = { 'font-size 字面值': [], 間距字面值: [] };

  for (const [name, { source: raw, scope, full }] of sheets) {
    const source = withoutComments(raw);
    const body = outsideRootBlocks(source);

    for (const token of new Set(usedTokens(source))) {
      if (!scope.has(token)) {
        violations.push(`${name}: 使用了未定義的 ${token}——這條宣告會靜默失效`);
      }
    }

    // error.css 是 404 頁的獨立樣式表：它刻意不載入 styles.css，也就沒有共用
    // token 可用，因此只檢查「用了自己沒定義的東西」這一項。
    if (!full) continue;

    for (const match of body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      violations.push(
        `${name}: 寫死的顏色 ${match[0]}——主題切換不會影響它，請改用 token`
      );
    }
    for (const match of body.matchAll(/font-weight: *([0-9]+)/g)) {
      violations.push(
        `${name}: 寫死的字重 ${match[1]}——請用 --weight-regular/medium/bold`
      );
    }
    for (const match of body.matchAll(
      /border-radius: *([^;{}]*[0-9][^;{}]*);/g
    )) {
      if (match[1].includes('var(--radius') || match[1].trim() === '0')
        continue;
      violations.push(
        `${name}: 寫死的圓角 ${match[1].trim()}——請用 --radius-*`
      );
    }
    for (const match of body.matchAll(/box-shadow: *([^;{}]+);/g)) {
      const value = match[1].trim();
      // inset 的內線與 keyframe 的焦點環是形狀而不是深度，不套 elevation。
      if (
        value.includes('var(--elevation') ||
        value.includes('var(--dot-live)') ||
        value.startsWith('inset') ||
        value === 'none' ||
        /^0 0 0 [0-9]/.test(value)
      ) {
        continue;
      }
      violations.push(`${name}: 寫死的陰影 ${value}——請用 --elevation-*`);
    }
    for (const match of source.matchAll(/@media \(max-width: ([^)]+)\)/g)) {
      if (CANONICAL_BREAKPOINTS.has(match[1])) continue;
      violations.push(
        `${name}: 斷點 ${match[1]} 不在正式尺度（64rem／48rem／30rem）內`
      );
    }
    for (const match of body.matchAll(/font-family: *([^;{}]+);/g)) {
      if (match[1].includes('var(--font-')) continue;
      violations.push(
        `${name}: 寫死的字體堆疊——請用 --font-sans/serif/mono。先前有兩份不同的 mono 堆疊，其中一份漏了 SFMono-Regular`
      );
    }
    // 字距是階段 5 拿來做層次的主要工具之一（不下載字型，就只剩字級／字重／
    // 字距／留白）。起點是十種彼此無關的字面值，所以收斂成 --tracking-* 之後
    // 直接鎖死。`inherit` 是刻意的：排序按鈕要沿用表頭的字距。
    for (const match of body.matchAll(/letter-spacing: *([^;{}]+);/g)) {
      const value = match[1].trim();
      if (value.includes('var(--tracking-') || value === 'inherit') continue;
      violations.push(
        `${name}: 寫死的字距 ${value}——請用 --tracking-display/tight/wide/label/eyebrow`
      );
    }

    // 香檳金（Brand Decorative Accent）只能是裝飾，永遠不能承載狀態或互動語意。
    // 這條守衛擋的是「哪天有人覺得金色好看，就拿去當 hover／選取／badge」——
    // 那一刻它就從品牌裝飾變成了狀態色，而使用者會開始以為金色有意義。
    // 狀態一律走 --forest／--amber／--danger／--info-text 等 semantic token。
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, declarations] = rule;
      if (!declarations.includes('var(--brand-metallic')) continue;
      const forbidden = [
        [':hover', 'hover 是互動回饋'],
        [':focus', '焦點必須用 --focus-ring'],
        [':active', 'active 是互動狀態'],
        ['[aria-current', 'aria-current 是「目前位置」狀態'],
        ['.is-active', '選取／啟用狀態'],
        ['.is-selected', '選取狀態'],
        ['status-chip', '狀態標籤'],
        ['button', '按鈕是操作，不是裝飾'],
        ['checkbox', '表單控制項'],
        ['sort-', '排序是狀態'],
        ['badge', '徽章通常表示狀態']
      ];
      for (const [needle, why] of forbidden) {
        if (!selector.includes(needle)) continue;
        violations.push(
          `${name}: 香檳金出現在 \`${selector.trim()}\`——${why}。Brand Decorative Accent 只能是裝飾，不得承載狀態或互動語意`
        );
      }
    }
    // `prefers-reduced-motion` 區塊是把動效**關掉**的地方（慣用的
    // `0.01ms !important`），時長 token 在那裡不適用。
    const animated = body.replace(
      /@media \(prefers-reduced-motion[^{]*\{[\s\S]*?\n\}/g,
      ''
    );
    for (const match of animated.matchAll(
      /(?:transition|animation)[^;{}]*?(\d+)ms/g
    )) {
      violations.push(
        `${name}: 寫死的動效時長 ${match[1]}ms——請用 --motion-fast/base/slow`
      );
    }

    for (const match of body.matchAll(/font-size: *([^;{}]+);/g)) {
      const value = match[1].trim();
      if (value.includes('var(--text') || value.startsWith('clamp(')) continue;
      if (RELATIVE_FONT_SIZE.test(value)) continue;
      if (TYPE_SCALE.has(value)) continue;
      debt['font-size 字面值'].push(`${name}: ${value}`);
    }
    for (const match of body.matchAll(SPACING_PROPERTIES)) {
      // scroll-margin 不是版面間距，而是「固定表頭要讓開多少」，跟著表頭高度
      // 走而不是跟著間距級數走，所以它有自己的 --scroll-anchor-offset。
      if (match[0].includes('scroll-')) continue;
      const parts = match[1].trim().split(/\s+/);
      if (parts.some((part) => part.startsWith('var(') || part.includes('('))) {
        continue;
      }
      if (
        parts.every(
          (part) => part === '0' || part === 'auto' || SPACING_GRID.has(part)
        )
      ) {
        continue;
      }
      debt['間距字面值'].push(`${name}: ${match[1].trim()}`);
    }
  }

  return { violations, debt };
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const publicDir = join(repoRoot, 'apps', 'web', 'public');
  const read = (name) => readFile(join(publicDir, name), 'utf8');

  const [styles, workbench, error] = await Promise.all([
    read('styles.css'),
    read('workbench.css'),
    read('error.css')
  ]);

  const base = definedTokens(styles);
  const sheets = new Map([
    ['styles.css', { source: styles, scope: base, full: true }],
    // workbench.css 永遠與 styles.css 一起載入，所以它看得到 base 的 token。
    [
      'workbench.css',
      {
        source: workbench,
        scope: new Set([...base, ...definedTokens(workbench)]),
        full: true
      }
    ],
    // error.css 是 404 頁的獨立樣式表，不載入 styles.css——它只有自己的 token。
    ['error.css', { source: error, scope: definedTokens(error), full: false }]
  ]);

  const { violations, debt } = planTokenReview(sheets);

  let failed = false;
  if (violations.length > 0) {
    failed = true;
    console.error('Design-token check failed:');
    for (const violation of violations) console.error(`- ${violation}`);
  }

  for (const [label, entries] of Object.entries(debt)) {
    const ceiling = CEILINGS[label];
    const status = entries.length > ceiling ? '超過上限' : 'ok';
    console.log(`${label}: ${entries.length} / 上限 ${ceiling}（${status}）`);
    if (entries.length > ceiling) {
      failed = true;
      console.error(
        `Design-token check failed: ${label} 增加了。上限是給既有債務用的，不是給新債務用的。`
      );
      for (const entry of entries.slice(0, 20)) console.error(`- ${entry}`);
    } else if (entries.length < ceiling) {
      console.log(
        `  已低於上限，請把 scripts/check-design-tokens.mjs 的 CEILINGS 調成 ${entries.length}。`
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log(
      'Design-token check passed (未定義 token、寫死色、字重、圓角、陰影、斷點皆為零).'
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
