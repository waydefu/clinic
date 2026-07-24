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
      await applyTheme(page, '/patient.html', theme);
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
    await applyTheme(page, '/patient.html', 'light');

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
      await applyTheme(page, '/patient.html', theme);
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
    await applyTheme(page, '/patient.html', 'dark');

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
