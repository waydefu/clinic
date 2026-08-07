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

// 容器尺寸。**與間距分開**：`width` 的端點就算落在 4px 網格上，也不代表它是
// `--space-*`——容器寬度與版面間距是兩種語意。目前只用來查 clamp 端點。
const LAYOUT_PROPERTIES =
  /\b(?:width|max-width|min-width|height|max-height|min-height|inline-size|block-size): ([^;{}]+);/g;

// 上限**逐檔記帳**。先前是全域一個數字，那在只有一份樣式表有債務時還行，
// 但 2026-08-06 把 clinic-site.css 納入全套檢查後就不行了：一個總數會讓
// 「官網收掉一筆、styles.css 新增一筆」互相抵銷而總數不變，於是新債務隱形。
// 債務是誰欠的就記在誰名下。
//
// 沒有列在這裡的樣式表，上限一律是 0。
const CEILINGS = {
  'font-size 字面值': {
    // 2026-08-06 已清零：9 個字級 clamp 的端點全部對齊尺度。留著這個 0 是為了
    // 讓下一筆債務有地方登記，而不是又長回隱形的樣子。
    'clinic-site.css': 0
  },
  間距字面值: {
    // 2026-08-06 首批收斂：49 → 11。收的是位移 ≤1.6px 的 38 條宣告——與
    // styles.css 當初對齊網格時的容忍同一量級，版面節奏看得出來但不會走樣。
    //
    // 剩下的 11 條各有理由，不是漏掉的：
    //   - 6／3.5／2.75／2.5／2.25／1.75rem 這幾個大間距離網格 4–32px，硬壓會
    //     明顯改變區塊的呼吸感。網格在 1.5→2→3→4rem 之間跳得很開，官網的
    //     大留白沒有對應的階，該補哪一階要先決定，不是逐條硬套。
    //   - 兩處 `margin: -1px` 是 1px 的邊框對齊修正，不是版面間距。
    'clinic-site.css': 11
  },
  '間距 clamp 端點': {
    // 2026-08-07 首次納入檢查。先前 `parts.some(part => part.includes('('))`
    // 讓任何含函式的間距值整條免檢——2026-08-06 修掉字級 clamp 之後，這是
    // 剩下的另外半個盲點。
    //
    // 起始上限＝實測現況，所以規則進來的這個 commit 自身是綠的。端點多半是
    // 1.4／1.6／2.2／2.5／3.5／5／6rem 這類值，離 SPACING_GRID 4–32px；
    // 硬壓會改變版面呼吸感，與「間距字面值」剩下那 11 條是同一個問題：
    // 網格在 1.5→2→3→4rem 之間跳得很開，官網的大留白沒有對應的階。
    // **要收斂之前得先決定補哪一階，不是逐條硬套。**
    'clinic-site.css': 16,
    'styles.css': 4,
    'workbench.css': 1
  },
  '容器 clamp 端點': {
    // 2026-08-07 首次納入檢查。這四筆是品牌標誌與圖片的響應式寬度。
    //
    // **刻意與間距分開記帳。** 這四個端點（9／12.5／6.5／5.5／7.5／10rem）
    // 雖然都落在 4px 網格上，但「能被 4 整除」不等於「它是 --space-*」——
    // 容器寬度與版面間距是兩種語意。這個專案目前沒有 layout／container token，
    // 所以沒有可以比對的尺度，端點一律先登記在檯面上。
    // **不要為了讓這個數字歸零而把它們改成 --space-***，那會寫進一條語意不對
    // 的規則；要收斂得先決定容器寬度的級數長什麼樣。
    'clinic-site.css': 4
  }
};

/** 某個標籤／樣式表的現行上限。沒登記過就是零。 */
function ceilingFor(label, sheet) {
  return CEILINGS[label]?.[sheet] ?? 0;
}

// `em` 字級是相對於父層文字的比例，語意跟字級尺度不同：`.back-arrow` 的箭頭與
// `.slot-chip-mark` 的記號都要跟著所在文字縮放，換成 rem 會切斷那個關係。
const RELATIVE_FONT_SIZE = /^[0-9.]+em$/;

/**
 * 找出每個 `:root` 區塊的範圍。**大括號要真的配對，不能靠縮排猜。**
 *
 * 先前 `definedTokens` 與 `outsideRootBlocks` 各自寫了一份
 * `/:root[^{]*\{[\s\S]*?\n\}/`，它找的是「換行後頂格的 `}`」。`:root` 寫在檔案
 * 最外層時碰巧成立，但**寫在 `@media` 裡就不成立**——那個 `:root` 的結尾是縮排
 * 的 `  }`，比對不到，於是一路吃到整個 `@media` 區塊的結尾。
 *
 * 2026-08-06 實測這個 bug 吞掉的量：`clinic-site.css` 230 行／44 條 class 規則，
 * `workbench.css` 114 行／27 條。那些規則裡的寫死顏色、字重、圓角、陰影、字距與
 * 動效**從來沒有被檢查過**，而 gate 一直是綠的。兩份檔案都只是寫了
 * `@media (max-width: 48rem) { :root { --shell: ...; } }` 這種完全正當的斷點覆寫。
 *
 * 兩個用途共用這一個掃描，邊界才只有一種說法。
 *
 * @returns {{ start: number, bodyStart: number, end: number }[]}
 *   `start` 是 `:root` 的起點，`bodyStart` 是 `{` 之後，`end` 是配對 `}` 之後。
 */
export function rootBlockRanges(source) {
  const opening = /:root[^{]*\{/g;
  const ranges = [];
  let match;
  while ((match = opening.exec(source)) !== null) {
    const bodyStart = opening.lastIndex;
    let depth = 1;
    let index = bodyStart;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      index += 1;
    }
    ranges.push({ start: match.index, bodyStart, end: index });
    opening.lastIndex = index;
  }
  return ranges;
}

/**
 * 取出所有 `:root { }` 區塊裡定義的自訂屬性。
 *
 * 只認**真正的** `:root` 區塊。`.clinic-word { --clinic-word-index: 0; }` 這種
 * 只在該選擇器內有效的區域性自訂屬性不算全域 token，否則「使用了未定義的
 * token」那條守衛會跟著失準。
 */
export function definedTokens(source) {
  const defined = new Set();
  for (const { bodyStart, end } of rootBlockRanges(source)) {
    // end 已越過配對的 `}`，body 要退一格。
    for (const match of source
      .slice(bodyStart, end - 1)
      .matchAll(/(--[a-z0-9-]+):/g)) {
      defined.add(match[1]);
    }
  }
  // `@property` 也是宣告，而且是**帶型別與 initial-value 的那一種**——沒有它
  // 就無法對自訂屬性做動畫（瀏覽器不知道 `0deg` 到 `360deg` 之間要怎麼內插）。
  // 只認 `:root` 會讓這個守衛把正確的現代寫法報成「未定義」，於是把人推回舊寫法，
  // 或者更糟：在 `:root` 再寫一次同一個初始值，讓同一件事有兩個來源。
  for (const match of source.matchAll(/@property\s+(--[a-z0-9-]+)/g)) {
    defined.add(match[1]);
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

/**
 * 依**括號深度**切開函式引數。不能用 `value.split(',')`：目標寫法本身就有
 * 巢狀函式（`clamp(var(--a), calc(var(--b) + 2vw), var(--c))`），逗號切割會在
 * 第一個 `calc()` 裡切錯。帶 fallback 的 `var(--x, 1rem)`、巢狀 `min()`／
 * `max()` 也是同樣的問題。
 */
export function splitArguments(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

const FLUID_UNIT = /[0-9.]+(?:vw|vh|vmin|vmax|cqw|cqi|cqb|cqh)\b/;

/**
 * 把 shorthand 依「括號深度為零處的空白」切開。
 *
 * `split(/\s+/)` 對 `padding: clamp(4rem, 8vw, 7rem) 0` 會切出六塊碎片，
 * 因為 clamp 的引數之間有空白。這裡與 `splitArguments` 同一個道理，只是分隔符
 * 從逗號換成空白。
 */
export function splitShorthand(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of value.trim()) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (current.trim() !== '') parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/**
 * 三個 property group 各自的 clamp 政策。
 *
 * **`reviewClamp()` 只共用語法解析與 fail-closed 行為**——拆出三個引數、拆不出來
 * 就失敗。min／max 與 preferred 的合法性一律由這裡的 policy 決定，**三類不共用
 * 同一套尺度，也不共用同一套 preferred-value 規則**。
 *
 * 為什麼不能共用：字級那條「preferred 必須有可縮放文字基底」來自 SC 1.4.4 的
 * 文字縮放要求。間距與容器寬度**沒有**那個要求——把它套過去是憑空發明限制，
 * 而且會逼人改掉 `padding: clamp(1rem, 4vw, 3rem)` 這種完全合法的寫法。
 *
 * 端點的尺度同理：`width` 的端點就算剛好能被 4 整除，也**不代表**它是
 * `--space-*`。容器寬度與版面間距在語意上是兩回事，為了填掉一個舊盲點而把它們
 * 併成同一條規則，比留著盲點更糟。
 */
export const CLAMP_POLICIES = {
  fontSize: {
    endpointScale: TYPE_SCALE,
    endpointTokens: ['var(--text', 'var(--clinic-text'],
    endpointName: '字級尺度',
    requireFluidPreferred: true,
    // 以下兩條**只有字級有**，理由是 SC 1.4.4：
    requireScalableBase: true,
    rejectAbsolutePreferred: true,
    endpointsAreRatchetDebt: false
  },
  spacing: {
    endpointScale: SPACING_GRID,
    endpointTokens: ['var(--space'],
    endpointName: '間距級數',
    requireFluidPreferred: true,
    requireScalableBase: false,
    rejectAbsolutePreferred: false,
    endpointsAreRatchetDebt: true
  },
  layout: {
    // 這個專案目前**沒有** layout／container token，所以沒有可比對的尺度。
    // 端點一律登記成 ratchet 債務，不假裝它們該用 --space-*。要收斂之前得先
    // 決定容器寬度的級數長什麼樣，那是另一件事。
    endpointScale: new Set(),
    endpointTokens: ['var(--layout', 'var(--container', 'var(--shell'],
    endpointName: 'layout token',
    requireFluidPreferred: true,
    requireScalableBase: false,
    rejectAbsolutePreferred: false,
    endpointsAreRatchetDebt: true
  }
};

/** 端點是不是來自該類別自己的尺度——token 或尺度上的字面值都算。 */
function onEndpointScale(value, policy) {
  const trimmed = value.trim();
  if (policy.endpointTokens.some((prefix) => trimmed.includes(prefix)))
    return true;
  return policy.endpointScale.has(trimmed);
}

/**
 * `clamp()` 的驗證。
 *
 * 先前 `font-size` 這裡是 `if (value.startsWith('clamp(')) continue;`——**只要包進
 * clamp() 就完全免檢**，於是官網 18 個端點只有 1 個在尺度上而 gate 全綠。
 * 2026-08-06 修掉字級那條；2026-08-07 補上間距與 layout 兩類，非字級的 28 處
 * 從此不再靠 `parts.some(part => part.includes('('))` 整條放行。
 *
 * @returns {{ violation: string | null, debt: string | null }}
 *   `violation` 直接擋 CI；`debt` 進 ratchet 記帳。
 */
export function reviewClamp(value, policy) {
  const inner = value.trim().slice('clamp('.length, -1);
  const parts = splitArguments(inner);
  if (parts.length !== 3) {
    return {
      violation: `clamp() 解析不出三個引數（${parts.length} 個）——無法判定就不放行`,
      debt: null
    };
  }

  const [minimum, preferred, maximum] = parts;

  const offScale = [
    ['最小值', minimum],
    ['最大值', maximum]
  ].filter(([, endpoint]) => !onEndpointScale(endpoint, policy));

  // 端點：字級是硬性違規，間距與 layout 進 ratchet。
  if (offScale.length > 0 && !policy.endpointsAreRatchetDebt) {
    const [which, endpoint] = offScale[0];
    return {
      violation: `clamp() 的${which} \`${endpoint}\` 不在${policy.endpointName}上`,
      debt: null
    };
  }

  if (policy.requireFluidPreferred && !FLUID_UNIT.test(preferred)) {
    return {
      violation: `clamp() 的中間值 \`${preferred}\` 沒有流體單位——那就不需要 clamp`,
      debt: null
    };
  }
  if (
    policy.requireScalableBase &&
    !(
      policy.endpointTokens.some((prefix) => preferred.includes(prefix)) ||
      /[0-9.]+r?em\b/.test(preferred)
    )
  ) {
    // W3C F94：純 viewport unit 當作主要的字級定義方式，文字可能無法隨使用者的
    // 文字大小設定放大。要求的是「可縮放基底 ＋ 流體單位」，**不是禁用 vw**。
    return {
      violation: `clamp() 的中間值 \`${preferred}\` 只有 viewport 單位，缺少可隨文字設定縮放的基底（SC 1.4.4）`,
      debt: null
    };
  }
  if (policy.rejectAbsolutePreferred && /[0-9.]+px\b/.test(preferred)) {
    return {
      violation: `clamp() 的中間值 \`${preferred}\` 用了 px——字級不接受絕對單位`,
      debt: null
    };
  }

  if (offScale.length === 0) return { violation: null, debt: null };
  return {
    violation: null,
    debt: `${offScale.map(([which, endpoint]) => `${which} \`${endpoint}\``).join('、')} 不在${policy.endpointName}上`
  };
}

/**
 * 流體字級的驗證。保留這個名字與「回傳字串或 null」的形狀，因為字級的端點是
 * 硬性違規、沒有 ratchet 那一半。
 *
 * @returns {string | null} 違規說明；合格回傳 null。
 */
export function reviewFontSizeClamp(value) {
  return reviewClamp(value, CLAMP_POLICIES.fontSize).violation;
}

/** `:root` 區塊以外的內容——寫死顏色只有在這裡才算違規。 */
export function outsideRootBlocks(source) {
  let result = '';
  let copiedTo = 0;
  for (const { start, end } of rootBlockRanges(source)) {
    result += source.slice(copiedTo, start);
    copiedTo = end;
  }
  return result + source.slice(copiedTo);
}

/**
 * 純核心：給定每個樣式表的內容，回傳硬性違規與需要計數的債務。
 *
 * @param sheets Map<檔名, { source, scope }>，scope 是這個檔案可用的 token 集合
 */
export function planTokenReview(sheets) {
  const violations = [];
  const debt = {
    'font-size 字面值': [],
    間距字面值: [],
    '間距 clamp 端點': [],
    '容器 clamp 端點': []
  };

  for (const [name, { source: raw, scope, full, breakpoints }] of sheets) {
    const source = withoutComments(raw);
    const body = outsideRootBlocks(source);

    for (const token of new Set(usedTokens(source))) {
      if (!scope.has(token)) {
        violations.push(`${name}: 使用了未定義的 ${token}——這條宣告會靜默失效`);
      }
    }

    // 斷點尺度與「用的是哪一套 token」無關：一份樣式表就算自成系統，它的斷點
    // 仍然必須與其他頁面對齊，否則同一個瀏覽器寬度下兩頁會在不同的地方重排。
    if (!full && breakpoints === true) {
      for (const match of source.matchAll(/@media \(max-width: ([^)]+)\)/g)) {
        if (CANONICAL_BREAKPOINTS.has(match[1])) continue;
        violations.push(
          `${name}: 斷點 ${match[1]} 不在正式尺度（64rem／48rem／30rem）內`
        );
      }
    }

    // 自成一頁、不載入共用樣式表的檔案（404、隱私權政策、診所官網）沒有共用
    // token 可用，因此只跑上面那些與系統無關的檢查。
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
      if (
        match[1].includes('var(--radius') ||
        match[1].includes('var(--clinic-radius') ||
        match[1].trim() === '0'
      )
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
        value.includes('var(--clinic-elevation') ||
        value.includes('var(--clinic-shadow') ||
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
      if (
        match[1].includes('var(--font-') ||
        match[1].includes('var(--clinic-font-')
      )
        continue;
      violations.push(
        `${name}: 寫死的字體堆疊——請用 --font-sans/serif/mono。先前有兩份不同的 mono 堆疊，其中一份漏了 SFMono-Regular`
      );
    }
    // 字距是階段 5 拿來做層次的主要工具之一（不下載字型，就只剩字級／字重／
    // 字距／留白）。起點是十種彼此無關的字面值，所以收斂成 --tracking-* 之後
    // 直接鎖死。`inherit` 是刻意的：排序按鈕要沿用表頭的字距。
    for (const match of body.matchAll(/letter-spacing: *([^;{}]+);/g)) {
      const value = match[1].trim();
      if (
        value.includes('var(--tracking-') ||
        value.includes('var(--clinic-tracking-') ||
        value === 'inherit'
      )
        continue;
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
    // 緩動曲線也必須來自 token。`ease`／`ease-in-out`／`linear` 這些關鍵字看起來
    // 無害，但它們是**另一套曲線**——同一個介面裡混用，動效的「個性」就不一致了。
    // 這個系統採 Carbon 所謂的 productive 風格（快、克制、不回彈），只有
    // --ease-standard 與 --ease-decelerate 兩條曲線。
    for (const match of animated.matchAll(
      /(?:transition|animation): *([^;{}]+);/g
    )) {
      const value = match[1];
      // 先把 `var(--ease-standard)` 這類整段拿掉再檢查——否則 token 名字裡的
      // 「ease」會被誤判成寫死的關鍵字。
      const withoutTokens = value.replace(/var\([^)]*\)/g, '');
      if (
        !/\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/.test(withoutTokens)
      )
        continue;
      violations.push(
        `${name}: 寫死的緩動 \`${value.trim().replace(/\s+/g, ' ')}\`——請用 --ease-standard/decelerate`
      );
    }

    for (const match of body.matchAll(/font-size: *([^;{}]+);/g)) {
      const value = match[1].trim().replace(/\s+/g, ' ');
      // 流體字級要逐項驗證，**不能整條放行**——先前只要包進 clamp() 就免檢。
      if (value.startsWith('clamp(')) {
        const problem = reviewFontSizeClamp(value);
        if (problem !== null) violations.push(`${name}: ${problem}`);
        continue;
      }
      // `--text-*` 是共用尺度；`--clinic-text-*` 是官網自己宣告的同一套級數
      // （`clinic.html` 不載入 styles.css，所以它不能引用共用的那份，但值逐階
      // 相同）。兩者都是「字級來自尺度」，判定上等價。
      if (value.includes('var(--text') || value.includes('var(--clinic-text'))
        continue;
      if (RELATIVE_FONT_SIZE.test(value)) continue;
      if (TYPE_SCALE.has(value)) continue;
      debt['font-size 字面值'].push(`${name}: ${value}`);
    }
    // 容器尺寸的 clamp。**這不是完整的 layout token gate**——它只看 clamp()，
    // 不查 `width: 100%` 之類的字面值。範圍刻意這麼窄：本輪要補的是「包進函式
    // 就免檢」這個盲點，不是憑空發明一套容器寬度級數。
    for (const match of body.matchAll(LAYOUT_PROPERTIES)) {
      for (const part of splitShorthand(match[1])) {
        if (!part.startsWith('clamp(')) continue;
        const { violation, debt: endpointDebt } = reviewClamp(
          part,
          CLAMP_POLICIES.layout
        );
        if (violation !== null) violations.push(`${name}: ${violation}`);
        else if (endpointDebt !== null)
          debt['容器 clamp 端點'].push(`${name}: ${endpointDebt}`);
      }
    }
    for (const match of body.matchAll(SPACING_PROPERTIES)) {
      // scroll-margin 不是版面間距，而是「固定表頭要讓開多少」，跟著表頭高度
      // 走而不是跟著間距級數走，所以它有自己的 --scroll-anchor-offset。
      if (match[0].includes('scroll-')) continue;

      // clamp() 要逐項驗證，不能跟著下面那條函式豁免一起整條放行——那正是
      // 2026-08-06 修掉字級 clamp 之後還留著的另外半個盲點。
      // **注意用 splitShorthand 而不是 split(/\s+/)**：`padding: clamp(a, b, c) 0`
      // 的 clamp 內部有空白，用空白切會把它拆碎。
      const shorthand = splitShorthand(match[1]);
      if (shorthand.some((part) => part.startsWith('clamp('))) {
        for (const part of shorthand) {
          if (!part.startsWith('clamp(')) continue;
          const { violation, debt: endpointDebt } = reviewClamp(
            part,
            CLAMP_POLICIES.spacing
          );
          if (violation !== null) violations.push(`${name}: ${violation}`);
          else if (endpointDebt !== null)
            debt['間距 clamp 端點'].push(`${name}: ${endpointDebt}`);
        }
        continue;
      }

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

  // 2026-07-27（自動檢查缺口 F-2）：先前只掃三份，而 public/ 裡有六份樣式表。
  // 沒被掃到的那三份可以隨便寫死色、斷點、字重而這支腳本照樣印「全部為零」——
  // 一個只涵蓋一半的檢查比沒有檢查更容易誤導。實際上 clinic-booking.css 當時
  // 就有一個範圍外的斷點（62rem）。
  const [styles, workbench, error, clinicBooking, clinicSite, privacy] =
    await Promise.all([
      read('styles.css'),
      read('workbench.css'),
      read('error.css'),
      read('clinic-booking.css'),
      read('clinic-site.css'),
      read('privacy.css')
    ]);

  const base = definedTokens(styles);
  const withBase = (source) => new Set([...base, ...definedTokens(source)]);
  const sheets = new Map([
    ['styles.css', { source: styles, scope: base, full: true }],
    // workbench.css 永遠與 styles.css 一起載入，所以它看得到 base 的 token。
    [
      'workbench.css',
      { source: workbench, scope: withBase(workbench), full: true }
    ],
    // clinic-booking.css 同樣與 styles.css 一起載入（患者頁的視覺橋接層）。
    [
      'clinic-booking.css',
      { source: clinicBooking, scope: withBase(clinicBooking), full: true }
    ],
    // error.css 與 privacy.css 是自成一頁的獨立樣式表，不載入 styles.css
    // ——它們只有自己的 token，所以只檢查「用了自己沒定義的東西」。
    ['error.css', { source: error, scope: definedTokens(error), full: false }],
    [
      'privacy.css',
      { source: privacy, scope: definedTokens(privacy), full: false }
    ],
    // clinic-site.css 仍是**另一套** token 系統（`--clinic-*`：白／霧綠／深林）
    // ——`clinic.html` 只載入這一份樣式表，所以它用不到 `styles.css` 的 token，
    // `scope` 因此維持只有它自己定義的那些。**但規則全套適用**。
    //
    // 2026-08-06 解除了先前的 `full: false`。當時的理由是「全套規則會產生數百筆
    // 噪音」，代價是官網成了設計系統的化外之地：九條規則只跑兩條，於是 20 種
    // 字級、六階字重（其中 650 與 750 完全看不出差別）、12 種圓角與 14 種動效
    // 時長全部合法，而 CI 全綠。噪音是真的，但那是**債務的聲音**，不是規則的錯。
    //
    // 現在字重、顏色、陰影、字體堆疊、字距、動效時長與緩動都已收斂到零；
    // 字級、間距與圓角的字面值掛在下面的 ratchet 上分批收。
    [
      'clinic-site.css',
      {
        source: clinicSite,
        scope: definedTokens(clinicSite),
        full: true,
        breakpoints: true
      }
    ]
  ]);

  const { violations, debt } = planTokenReview(sheets);

  let failed = false;
  if (violations.length > 0) {
    failed = true;
    console.error('Design-token check failed:');
    for (const violation of violations) console.error(`- ${violation}`);
  }

  for (const [label, entries] of Object.entries(debt)) {
    // 逐檔記帳。entry 的格式是 `<檔名>: <值>`，所以檔名就在冒號前。
    const bySheet = new Map();
    for (const entry of entries) {
      const sheet = entry.slice(0, entry.indexOf(':'));
      if (!bySheet.has(sheet)) bySheet.set(sheet, []);
      bySheet.get(sheet).push(entry);
    }
    // 上限降到零的樣式表也要出現在報表裡，否則「已經清乾淨了」看不出來。
    for (const sheet of Object.keys(CEILINGS[label] ?? {}))
      if (!bySheet.has(sheet)) bySheet.set(sheet, []);

    for (const [sheet, sheetEntries] of [...bySheet].sort()) {
      const ceiling = ceilingFor(label, sheet);
      const count = sheetEntries.length;
      const status = count > ceiling ? '超過上限' : 'ok';
      console.log(
        `${label}（${sheet}）: ${count} / 上限 ${ceiling}（${status}）`
      );
      if (count > ceiling) {
        failed = true;
        console.error(
          `Design-token check failed: ${sheet} 的${label}增加了。上限是給既有債務用的，不是給新債務用的。`
        );
        for (const entry of sheetEntries.slice(0, 20))
          console.error(`- ${entry}`);
      } else if (count < ceiling) {
        console.log(
          `  已低於上限，請把 scripts/check-design-tokens.mjs 的 CEILINGS['${label}']['${sheet}'] 調成 ${count}。`
        );
      }
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
