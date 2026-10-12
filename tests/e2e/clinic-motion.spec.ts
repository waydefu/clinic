import { expect, test } from '@playwright/test';

// 首頁動效與補全後的資訊區塊。
//
// 動效最容易壞在三個地方，而三個都不會有錯誤訊息：進場效果把內容永久留在隱藏
// 狀態、動效推高版面位移、以及使用者要求減少動態時照播不誤。這一組各盯一個。

test.describe('首頁動效', () => {
  test('進場效果只在 JS 執行時啟用，內容不會被永久藏起來', async ({ page }) => {
    await page.goto('/clinic');

    // `.clinic-motion` 是唯一會讓 [data-reveal] 變透明的開關，它由腳本加上。
    await expect(page.locator('html')).toHaveClass(/clinic-motion/);

    const sections = page.locator('[data-reveal]');
    await expect(sections).not.toHaveCount(0);

    // 捲到任何一個區塊都必須揭開；留在 opacity: 0 就等於內容不見了。
    const first = sections.first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toHaveClass(/is-revealed/);
    await expect(first).toHaveCSS('opacity', '1');
  });

  test('捲動後其餘區塊會依序揭開', async ({ page }) => {
    await page.goto('/clinic');
    const faq = page.locator('#clinic-faq');
    await faq.scrollIntoViewIfNeeded();
    await expect(faq).toHaveClass(/is-revealed/);
    await expect(faq).toHaveCSS('opacity', '1');
  });

  test('捲離頁首後 header 收合', async ({ page }) => {
    await page.goto('/clinic');
    const header = page.locator('.clinic-header');
    await expect(header).not.toHaveClass(/is-condensed/);

    await page.locator('#clinic-faq').scrollIntoViewIfNeeded();
    await expect(header).toHaveClass(/is-condensed/);
  });

  // 業主 2026-08-01 明確要求圖片不可分割或遮擋，所以進場只能淡入。縮放會讓圖片
  // 在動畫期間超出容器被裁掉一圈，clip-path 則是直接遮住一部分。
  test('圖片進場不縮放也不被遮罩', async ({ page }) => {
    await page.goto('/clinic');
    const image = page.locator('[data-reveal] img').first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveCSS('transform', 'none');
    await expect(image).toHaveCSS('clip-path', 'none');
  });
});

test.describe('減少動態偏好', () => {
  test('所有區塊直接可見，不播放進場', async ({ page }) => {
    // 用 `emulateMedia` 而不是 `test.use({ reducedMotion })`：後者在這個專案的
    // 設定下沒有生效（實測 `matchMedia(...).matches` 仍為 false），於是測試看起來
    // 在驗證減少動態，實際上驗證的是一般模式——一個會通過但什麼都沒測到的測試。
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/clinic');
    for (const id of ['#clinic-visit', '#clinic-faq']) {
      await expect(page.locator(id)).toHaveCSS('opacity', '1');
    }
    // 2026-10-11 改版拿掉了捲動進度條；它不可以再被加回來當裝飾。
    await expect(page.locator('.clinic-scroll-progress')).toHaveCount(0);

    // 相簿換照片時直接換，不做淡入。
    const space = page.locator('#clinic-space');
    await space.getByRole('button', { name: '下一張' }).click();
    await expect(space.locator('.clinic-space__caption')).toContainText(
      '2 / 4'
    );
    const running = await space
      .locator('.clinic-space__photo')
      .evaluate((node) => node.getAnimations().length);
    expect(running).toBe(0);
  });
});

test.describe('相簿換照片', () => {
  test('一般模式下新照片淡入，時長取自動效 token', async ({ page }) => {
    await page.goto('/clinic');
    const space = page.locator('#clinic-space');
    const photo = space.locator('.clinic-space__photo');
    // 動畫與說明文字在同一段同步程式裡開始；MutationObserver 的回呼排在那段
    // 程式之後，所以回呼裡一定看得到剛建立的動畫。
    await page.evaluate(() => {
      const img = document.querySelector('.clinic-space__photo');
      const caption = document.querySelector('.clinic-space__caption');
      if (!img || !caption) throw new Error('找不到相簿');
      const record = window as unknown as Record<string, unknown>;
      new MutationObserver((_, observer) => {
        observer.disconnect();
        const [animation] = img.getAnimations();
        const effect = animation?.effect as KeyframeEffect | undefined;
        record['__spaceFade'] = effect
          ? {
              duration: Number(effect.getComputedTiming().duration ?? 0),
              opacity: String(effect.getKeyframes()[0]?.['opacity'])
            }
          : null;
      }).observe(caption, {
        subtree: true,
        characterData: true,
        childList: true
      });
    });
    await space.getByRole('button', { name: '下一張' }).click();
    const fade = await page
      .waitForFunction(() => {
        const record = window as unknown as Record<string, unknown>;
        return '__spaceFade' in record ? { value: record['__spaceFade'] } : 0;
      })
      .then((handle) => handle.jsonValue());
    const result = fade.value as { duration: number; opacity: string } | null;
    expect(result, '換照片時沒有淡入').not.toBeNull();
    expect(result!.opacity).toBe('0');
    expect(result!.duration).toBeGreaterThan(0);
    await expect(photo).toHaveCSS('opacity', '1');
  });
});

test.describe('補全的首頁資訊', () => {
  // 2026-10-12 門診資訊改成星期 × 時段的打點表。逐格比對，並與 clinic.html 的
  // openingHoursSpecification 對照——三處（文字、表格、結構化資料）任何一處改了而
  // 其他沒跟上，這裡就會紅。
  test('門診時間與官網一致', async ({ page }) => {
    await page.goto('/clinic');
    const rows = await page
      .locator('#clinic-visit table.clinic-schedule tbody tr')
      .evaluateAll((nodes) =>
        nodes.map((row) => ({
          time: row.querySelector('th')?.textContent?.trim(),
          open: [...row.querySelectorAll('td')].map((cell) =>
            cell.classList.contains('is-open')
          )
        }))
      );
    expect(rows).toEqual([
      {
        time: '12:00–20:00',
        open: [false, false, true, true, true, false, false]
      },
      {
        time: '10:00–18:00',
        open: [false, false, false, false, false, true, false]
      }
    ]);

    const structured = JSON.parse(
      (await page.locator('#clinic-structured-data').textContent()) ?? '{}'
    ) as {
      openingHoursSpecification: {
        dayOfWeek: string | string[];
        opens: string;
        closes: string;
      }[];
    };
    const week = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];
    expect(
      structured.openingHoursSpecification.map((spec) => {
        const days = ([] as string[]).concat(spec.dayOfWeek);
        return {
          time: `${spec.opens}–${spec.closes}`,
          open: week.map((day) => days.includes(day))
        };
      })
    ).toEqual(rows);

    // 每一格都有給報讀器的文字，不只靠打點。
    await expect(
      page.locator('#clinic-visit .clinic-schedule td .visually-hidden')
    ).toHaveCount(14);
    await expect(page.locator('#clinic-visit')).toContainText(
      '週日、週一、週二休診'
    );
    // 首屏資訊卡仍是文字版。
    const facts = page.locator('.clinic-hero-facts');
    await expect(facts).toContainText('週三至週五 12:00–20:00');
    await expect(facts).toContainText('週六 10:00–18:00');
  });

  // 業主 2026-10-12：Google 地圖要病人按下按鈕才載入。按之前不得有任何對 Google
  // 的請求；按下後才建立 iframe，簡易地圖與按鈕一起退場，焦點移到地圖上。
  test('Google 地圖點了才載入', async ({ page }) => {
    const external: string[] = [];
    await page.route(/^https:\/\/(www\.google\.com|maps\.)/, (route) => {
      external.push(route.request().url());
      return route.fulfill({ status: 204, body: '' });
    });
    await page.goto('/clinic');
    const visit = page.locator('#clinic-visit');
    await visit.scrollIntoViewIfNeeded();
    await expect(visit.locator('.clinic-visit__map-image')).toBeVisible();
    await expect(visit.locator('iframe')).toHaveCount(0);
    await expect(
      visit.getByRole('link', { name: '地圖資料 © OpenStreetMap 貢獻者' })
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(external).toEqual([]);

    await visit.getByRole('button', { name: '顯示 Google 地圖' }).click();
    const frame = visit.locator('iframe.clinic-visit__frame');
    await expect(frame).toHaveAttribute(
      'src',
      /^https:\/\/www\.google\.com\/maps\?/
    );
    await expect(frame).toHaveAttribute('title', 'Google 地圖：一森渼診所位置');
    await expect(frame).toBeFocused();
    await expect(visit.locator('.clinic-visit__map-image')).toHaveCount(0);
    await expect(
      visit.getByRole('button', { name: '顯示 Google 地圖' })
    ).toHaveCount(0);
    await expect.poll(() => external.length).toBeGreaterThan(0);
  });

  test('社群連結是乾淨網址，沒有追蹤或登入牆', async ({ page }) => {
    await page.goto('/clinic');
    const chips = page.locator('.clinic-social-chip');
    await expect(chips).toHaveCount(4);

    const hrefs = await chips.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).href)
    );
    expect(hrefs).toContain('https://page.line.me/821tzbtx');
    expect(hrefs).toContain('https://www.instagram.com/beauessence.tw');
    expect(hrefs).toContain('https://m.me/575723225620285');

    // 這三樣一旦回來就是退步：QR 彈窗、分享追蹤參數、Messenger 登入牆。
    const joined = hrefs.join(' ');
    expect(joined).not.toContain('openQrModal');
    expect(joined).not.toContain('utm_source');
    expect(joined).not.toContain('login.php');
  });

  test('常見問題維持衛教邊界且不承諾尚未核准的取消規則', async ({ page }) => {
    await page.goto('/clinic');
    const faq = page.locator('#clinic-faq');
    await expect(faq).toContainText('打鼾一定需要手術嗎？');
    await expect(faq).toContainText('需要先確認原因');
    await expect(faq).toContainText('實際診斷與處理方向會由醫師面診後說明');
    // D-005 未核准前，頁面上不得出現具體的截止時間或費用。
    await expect(faq).not.toContainText('24 小時');
    await expect(faq).not.toContainText('收費');
  });
});
