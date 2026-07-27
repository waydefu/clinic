import { expect, test, type Page } from '@playwright/test';

// 三個主題必須真的覆蓋整個頁面。
//
// 這個測試的存在是因為一個實際發生過的缺陷：hero 漸層、公告帶、頁尾與環境標籤
// 的顏色是寫死的深綠，完全不隨主題變。切到護眼或深色時，版面上最大的一塊維持
// 原樣——主題只換了一半，而且沒有任何自動化把關會發現，因為對比一直是過的。
//
// 所以這裡不只驗「對比有沒有過」，還驗「換主題之後顏色有沒有真的變」。前者
// 那個缺陷是通過的，後者才抓得到。

type Rgb = { r: number; g: number; b: number };

const THEMES = ['light', 'warm', 'dark'] as const;

function parseRgb(value: string): Rgb {
  const parts = value.match(/[\d.]+/g);
  if (parts === null) throw new Error(`無法解析顏色：${value}`);
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, background: string): number {
  const a = relativeLuminance(parseRgb(foreground));
  const b = relativeLuminance(parseRgb(background));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** theme.js 在首次繪製前讀這個鍵，所以要先寫入再重新載入。 */
async function applyTheme(page: Page, url: string, theme: string) {
  await page.goto(url);
  await page.evaluate(
    (value) => window.localStorage.setItem('beauessence_theme', value),
    theme
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function paintedStyle(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
}

test.describe('三個主題', () => {
  test('患者頁的深底區塊會隨主題改變，且維持 AA 對比', async ({ page }) => {
    const footers = new Map<string, string>();

    for (const theme of THEMES) {
      await applyTheme(page, '/booking', theme);
      const footer = await paintedStyle(page, '.patient-footer');
      footers.set(theme, footer.background);

      expect(
        contrast(footer.color, footer.background),
        `${theme} 頁尾文字對比`
      ).toBeGreaterThanOrEqual(4.5);
    }

    // 三個主題必須產生三種不同的深底——相同就代表顏色又被寫死了。
    const painted = [...footers]
      .map(([theme, background]) => `${theme}=${background}`)
      .join(', ');
    expect(new Set(footers.values()).size, `實際值：${painted}`).toBe(3);
  });

  test('工作臺 hero 的漸層會隨主題改變', async ({ page }) => {
    const heroes = new Map<string, string>();

    for (const theme of THEMES) {
      await applyTheme(page, '/', theme);
      const gradient = await page
        .locator('.hero-panel')
        .evaluate(
          (element) => window.getComputedStyle(element).backgroundImage
        );
      heroes.set(theme, gradient);
      expect(gradient).toContain('linear-gradient');
    }

    const painted = [...heroes]
      .map(([theme, gradient]) => `${theme}=${gradient}`)
      .join(' | ');
    expect(new Set(heroes.values()).size, `實際值：${painted}`).toBe(3);
  });

  test('品牌標誌與健保標章都真的載入了', async ({ page }) => {
    await applyTheme(page, '/booking', 'light');

    // `complete` 對載入失敗的圖片一樣是 true——naturalWidth 才分得出「載到了」
    // 與「路徑壞掉，瀏覽器安靜地放棄了」。後者在版面上只是少一塊，很容易出貨。
    for (const selector of [
      '.brand-mark',
      '.patient-header .patient-credentials img'
    ]) {
      const natural = await page
        .locator(selector)
        .evaluate((element: HTMLImageElement) => element.naturalWidth);
      expect(natural, `${selector} 沒有載入`).toBeGreaterThan(0);
    }
  });

  test('品牌標誌在深色主題下會提亮', async ({ page }) => {
    const filterFor = async (theme: string) => {
      await applyTheme(page, '/booking', theme);
      return page
        .locator('.brand-mark')
        .evaluate((element) => window.getComputedStyle(element).filter);
    };

    // 標誌是中明度的鼠尾草綠線稿。淺色與護眼底下不動它；深色底下若不提亮就會
    // 沉進背景——那不會被對比檢查抓到，因為標誌不是文字。
    expect(await filterFor('light')).toBe('none');
    expect(await filterFor('warm')).toBe('none');
    expect(await filterFor('dark')).not.toBe('none');
  });

  test('深色主題的深底不會比內容卡片還亮', async ({ page }) => {
    await applyTheme(page, '/booking', 'dark');

    const luminanceOfToken = (token: string) =>
      page.locator('body').evaluate((element, name) => {
        const value = window
          .getComputedStyle(element)
          .getPropertyValue(name)
          .trim()
          .replace('#', '');
        return [0, 2, 4].map((offset) =>
          parseInt(value.slice(offset, offset + 2), 16)
        );
      }, token);

    const [canvas, surface] = await Promise.all([
      luminanceOfToken('--canvas'),
      luminanceOfToken('--surface')
    ]);
    const footer = await paintedStyle(page, '.patient-footer');

    const toRgb = ([r, g, b]: number[]) => ({ r, g, b });
    const canvasLuminance = relativeLuminance(toRgb(canvas));
    const surfaceLuminance = relativeLuminance(toRgb(surface));
    const footerLuminance = relativeLuminance(parseRgb(footer.background));

    // 深色介面用亮度分層：畫布最暗、內容卡片最亮。這些裝飾性的深底必須落在
    // 兩者之間——比畫布亮才有「浮起來」的層次，但不可以亮過真正的內容，
    // 否則頁尾與 hero 會比預約卡片更搶眼。
    expect(footerLuminance).toBeGreaterThan(canvasLuminance);
    expect(footerLuminance).toBeLessThan(surfaceLuminance);
  });
});

// 階段 5：品牌層。這一組驗的是三條**最容易安靜壞掉**的界線。
test.describe('品牌層（香檳金與系統字體）', () => {
  test('一個字型檔都不下載，字型請求為零', async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        request.resourceType() === 'font' ||
        /\.(woff2?|ttf|otf)(\?|$)/i.test(url) ||
        /fonts\.(googleapis|gstatic)\.com|use\.typekit\.net/i.test(url)
      )
        fontRequests.push(url);
    });

    for (const url of ['/booking', '/']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
    }

    // 負責人 2026-07-25 拍板：不載入任何中文字型，預算永遠 0 KiB。
    expect(
      fontRequests,
      `不應有任何字型請求：${fontRequests.join(', ')}`
    ).toHaveLength(0);

    // 標記裡也不該出現為字型而設的 preload／preconnect。
    const fontHints = await page
      .locator('link[rel="preload"][as="font"], link[rel="preconnect"]')
      .count();
    expect(fontHints).toBe(0);
  });

  test('香檳金三個主題各自不同，且品牌眉題真的是金色', async ({ page }) => {
    const seen = new Map<string, string>();

    for (const theme of THEMES) {
      await applyTheme(page, '/booking', theme);

      const token = await page
        .locator('body')
        .evaluate((element) =>
          window
            .getComputedStyle(element)
            .getPropertyValue('--brand-metallic-text')
            .trim()
        );
      seen.set(theme, token);

      // 品牌眉題必須真的拿到金色。`.eyebrow-brand` 與 `.eyebrow` 權重相同，
      // 靠**順序**決勝：若有人把它移到 `.eyebrow` 前面，綠色會蓋掉金色，而且
      // 完全沒有錯誤訊息。這一條就是釘住那個。
      // 患者頁有兩個品牌眉題（hero 與預約完成頁），這裡量 hero 那一個。
      const eyebrow = await paintedStyle(page, '.patient-hero .eyebrow-brand');

      // hero 是漸層，所以 `backgroundColor` 是透明的——直接拿它比會被當成黑色，
      // 量出一個假的 3.5:1。要比的是漸層**每一個色停**，而且以最差的那個為準：
      // 文字會落在漸層的哪一段是版面決定的，不該把可讀性押在版面不會變上。
      const stops = await page.locator('.patient-hero').evaluate((element) =>
        (
          window
            .getComputedStyle(element)
            .backgroundImage.match(/rgba?\([^)]+\)/g) ?? []
        ).filter((stop) => {
          // **完全透明的色停要排除。**
          //
          // 漸層常以 `transparent` 收尾（計算後是 `rgba(0, 0, 0, 0)`），那不是
          // 一個背景色——那一段看到的是它底下的圖層。把它當色停比，等於拿黑色
          // 去比，會量出一個假的 3.5:1；這正是本函式上方註解在講的同一個陷阱，
          // 只是換成從色停進來的（2026-07-27 診所版 hero 改成含 transparent 的
          // 漸層後才浮現）。
          const parts = stop.match(/[\d.]+/g) ?? [];
          return parts.length < 4 || Number(parts[3]) > 0;
        })
      );
      expect(stops.length, 'hero 應該是漸層').toBeGreaterThan(1);

      for (const stop of stops)
        expect(
          contrast(eyebrow.color, stop),
          `${theme}：品牌眉題對 hero 漸層色停 ${stop} 的對比不足`
        ).toBeGreaterThanOrEqual(4.5);
    }

    // 三個主題必須是三個不同的金——直接沿用淺色值在深色底上只有 2.5:1。
    const painted = [...seen]
      .map(([theme, gold]) => `${theme}=${gold}`)
      .join(', ');
    expect(new Set(seen.values()).size, `三主題的金色重複了：${painted}`).toBe(
      3
    );
  });

  test('香檳金不得出現在狀態或互動元件上', async ({ page }) => {
    await applyTheme(page, '/booking', 'light');

    const leaked = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement);
      const gold = [
        '--brand-metallic-text',
        '--brand-metallic-line',
        '--brand-metallic-on-inverse',
        '--brand-metallic-surface'
      ].map((t) => root.getPropertyValue(t).trim().toLowerCase());
      const toHex = (value: string) => {
        const parts = value.match(/[\d.]+/g);
        return parts === null
          ? value
          : `#${parts
              .slice(0, 3)
              .map((p) => Math.round(Number(p)).toString(16).padStart(2, '0'))
              .join('')}`;
      };
      // 這些元件一旦帶上金色，金色就從裝飾變成了狀態。
      const guarded =
        'button, .button, a[href], input, .status-chip, .booking-stepper li';
      const hits: string[] = [];
      for (const element of document.querySelectorAll(guarded)) {
        const style = window.getComputedStyle(element);
        for (const property of ['color', 'backgroundColor', 'borderTopColor'])
          if (gold.includes(toHex(style[property as 'color'])))
            hits.push(
              `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/)[0]} [${property}]`
            );
      }
      return hits;
    });

    expect(
      leaked,
      `香檳金洩漏到互動或狀態元件：${leaked.join(', ')}`
    ).toHaveLength(0);
  });
});

// 階段 6：Motion System。
//
// 風格是 IBM Carbon 所謂的 **productive**——快、克制、不 overshoot。這是資料密集
// 的營運工具，櫃台整天在掃描表格，任何彈跳都會拖慢視線。動效**只用來解釋狀態
// 變化**，不做裝飾。
test.describe('動效系統', () => {
  test.describe('一般情況（未要求減少動效）', () => {
    test('處置後那一列會閃一下，讓人知道剛才動的是哪一筆', async ({ page }) => {
      // 用 emulateMedia 明確設定，不靠 test.use()——實測後者在這個設定檔下
      // **沒有生效**（頁面裡量到的 matchMedia 仍是 false），測試會因此驗錯前提。
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await applyTheme(page, '/', 'light');
      await page.locator('#login-account').fill('admin');
      await page.locator('#login-password').fill('beauessence-admin');
      await page.locator('#login-view button[type="submit"]').click();
      await expect(page.locator('#logout')).toBeVisible();

      await page.goto('/#appointments-section');
      await page.locator('#booking-workflow').evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
      await page.locator('#booking-name').fill('動效測試');
      await page.locator('#booking-phone').fill('0912345678');
      await page.locator('#booking-birth').fill('1990-05-20');
      await page.locator('#booking-national-id').fill('A123456789');
      await page.locator('#booking-kind').selectOption('initial');
      await page.locator('#slots [data-select-slot]').first().click();
      await page.locator('#booking-form button[type="submit"]').click();
      await expect(page.locator('#status')).toContainText('預約已建立');
      await page.locator('#appointment-status-filter').selectOption('all');

      const row = page.locator('.appointment-row').first();
      // 這段先前是壞的：CSS 選擇器停在 `.appointment-card`，但階段 3 之後列的
      // class 是 `.appointment-row`，於是動畫再也沒播過，而且不會報錯。
      const animations = await row.evaluate((element) => {
        element.classList.add('is-flash');
        const cell = element.querySelector('td');
        return cell === null
          ? []
          : cell.getAnimations().map((animation) => ({
              name: (animation as CSSAnimation).animationName,
              duration: Number(animation.effect?.getTiming().duration ?? 0)
            }));
      });

      expect(
        animations.map((animation) => animation.name),
        '列變更提示沒有播放——選擇器可能又跟標記脫節了'
      ).toContain('row-flash');
      // 停留要夠久才看得到；與 admin-bootstrap.js 移除 class 的計時器同值。
      expect(animations[0]?.duration).toBe(1600);
    });

    test('緩動一律來自 token，維持同一種個性', async ({ page }) => {
      await applyTheme(page, '/booking', 'light');
      const easings = await page.evaluate(() => {
        const found = new Set<string>();
        for (const sheet of document.styleSheets) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of rules) {
            const style = (rule as CSSStyleRule).style;
            if (style === undefined) continue;
            for (const property of [
              'transitionTimingFunction',
              'animationTimingFunction'
            ]) {
              const value = style[property as 'transitionTimingFunction'];
              if (value !== undefined && value !== '') found.add(value);
            }
          }
        }
        return [...found];
      });

      // `ease`／`ease-in-out`／`linear` 是**另一套曲線**；混用會讓動效的個性不一致。
      // 系統只有 --ease-standard 與 --ease-decelerate 兩條。
      const literals = easings.filter((value) =>
        /^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(value.trim())
      );
      expect(literals, `樣式表裡有寫死的緩動：${literals.join(', ')}`).toEqual(
        []
      );
    });
  });

  test.describe('要求減少動效時', () => {
    test('動效關掉，但「哪一列變了」這個資訊不能跟著消失', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await applyTheme(page, '/', 'light');
      await page.locator('#login-account').fill('admin');
      await page.locator('#login-password').fill('beauessence-admin');
      await page.locator('#login-view button[type="submit"]').click();
      await expect(page.locator('#logout')).toBeVisible();

      await page.goto('/#appointments-section');
      await page.locator('#booking-workflow').evaluate((element) => {
        (element as HTMLDetailsElement).open = true;
      });
      await page.locator('#booking-name').fill('動效測試');
      await page.locator('#booking-phone').fill('0912345678');
      await page.locator('#booking-birth').fill('1990-05-20');
      await page.locator('#booking-national-id').fill('A123456789');
      await page.locator('#booking-kind').selectOption('initial');
      await page.locator('#slots [data-select-slot]').first().click();
      await page.locator('#booking-form button[type="submit"]').click();
      await expect(page.locator('#status')).toContainText('預約已建立');
      await page.locator('#appointment-status-filter').selectOption('all');

      await page
        .locator('.appointment-row')
        .first()
        .evaluate((element) => element.classList.add('is-flash'));
      // 加上 class 之後要讓瀏覽器重算一次樣式再讀。在同一個 tick 裡讀
      // `backgroundColor` 會拿到還沒套用的值（`animation-name` 這種會即時反映、
      // 顏色卻不會），先前就是因此誤判成「reduced-motion 下沒有標示」。
      await page.waitForTimeout(120);

      const cellBackground = await page
        .locator('.appointment-row')
        .first()
        .evaluate((element) => {
          const cell = element.querySelector('td');
          return cell === null
            ? ''
            : window.getComputedStyle(cell).backgroundColor;
        });

      // 全域的 reduced-motion 規則把動畫壓成 0.01ms，等於看不到閃動。所以這裡改用
      // **靜態底色**——不會動，但「是這一列」仍然看得出來。
      expect(
        cellBackground,
        'reduced-motion 下那一列必須仍然有可見的標示'
      ).not.toBe('rgba(0, 0, 0, 0)');
    });
  });
});
