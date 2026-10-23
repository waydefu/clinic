import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { CLINIC_UI_SCAN_ROUTES } from './support/clinic-routes';

const CLINIC_ROUTES = [
  ['/clinic', '鼻塞、打鼾與睡眠呼吸門診'],
  ['/clinic/doctors', '醫師團隊'],
  ['/clinic/doctors/yan-cheng-an', '顏正安 院長'],
  ['/clinic/doctors/yang-sheng-feng', '楊昇峯 醫師'],
  ['/clinic/nasal/snoring-five-in-one', '止鼾五合一'],
  ['/clinic/nasal/inferior-turbinate-surgery', '下鼻甲手術'],
  ['/clinic/nasal/septoplasty', '鼻中隔手術'],
  ['/clinic/nasal/snore-relief-mouthguard', '止鼾好眠牙套']
] as const;

test.describe('診所網站整合', () => {
  for (const [path, heading] of CLINIC_ROUTES) {
    test(`${path} 可閱讀並能前往既有預約流程`, async ({ page }) => {
      await page.goto(path);

      // 比可及名稱，不用 textContent：標題若日後加上視覺拆字，報讀器專用的
      // 完整字串會讓 textContent 重複。
      await expect(
        page.getByRole('heading', { level: 1 })
      ).toHaveAccessibleName(heading);
      await expect(
        page
          .getByRole('link', {
            name: /線上預約|預約諮詢|預約門診|預約專業評估/
          })
          .first()
      ).toHaveAttribute('href', '/booking');
      await expect(page).toHaveTitle(/^【測試用】/);
    });
  }

  test('首頁只呈現醫師與鼻功能醫學的指定內容範圍', async ({ page }) => {
    await page.goto('/clinic');

    await expect(page.locator('.clinic-service-card')).toHaveCount(4);
    await expect(page.locator('.clinic-doctor-card')).toHaveCount(2);
    await expect(
      page.getByRole('navigation', { name: '診所網站導覽' })
    ).not.toContainText(/微整形|整形手術|光電注射/);
    await expect(page.locator('main')).not.toContainText(
      /醫美|微整|隆鼻|抽脂|玻尿酸|肉毒|雷射/
    );
  });

  test('首頁提供測鼾聲 App 的官方下載入口與第三方聲明', async ({ page }) => {
    await page.goto('/clinic');

    const section = page.locator('.clinic-snore-app');
    await expect(section).toContainText('SnoreLab');
    await expect(section).toContainText('不是診斷工具');
    await expect(
      section.getByRole('link', { name: 'App Store 下載' })
    ).toHaveAttribute(
      'href',
      'https://apps.apple.com/us/app/snorelab-record-your-snoring/id529443604'
    );
    await expect(
      section.getByRole('link', { name: 'Google Play 下載' })
    ).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.snorelab.app'
    );
    await expect(
      section.getByRole('link', { name: 'SnoreLab 官方網站' })
    ).toHaveAttribute('href', 'https://www.snorelab.com');
  });

  test('症狀導覽更新可及狀態與對應衛教連結', async ({ page }) => {
    await page.goto('/clinic');

    const option = page.getByRole('button', {
      name: '想了解非手術止鼾方式'
    });
    await option.click();

    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.clinic-symptom-guidance')).toContainText(
      '可以先了解：止鼾好眠牙套'
    );
    await expect(
      page.getByRole('link', { name: '查看相關服務' })
    ).toHaveAttribute('href', '/clinic/nasal/snore-relief-mouthguard');
  });

  // 相簿由使用者自己翻（業主 2026-10-11 決定不輪播）。說明區是 aria-live，
  // 所以照片、替代文字、說明與「第幾張」必須一起換，按鈕狀態也要跟上。
  test('診所空間相簿可前後翻頁、點縮圖，連點時只留最後一次', async ({
    page
  }) => {
    await page.goto('/clinic');
    const space = page.locator('#clinic-space');
    const photo = space.locator('.clinic-space__photo');
    const caption = space.locator('.clinic-space__caption');
    const thumbs = space.locator('.clinic-space__thumb');

    await expect(caption).toHaveAttribute('aria-live', 'polite');
    await expect(caption).toContainText('接待櫃檯');
    await expect(caption).toContainText('1 / 4');
    await expect(thumbs).toHaveCount(4);
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');

    await space.getByRole('button', { name: '下一張' }).click();
    await expect(caption).toContainText('候診區');
    await expect(caption).toContainText('2 / 4');
    await expect(photo).toHaveAttribute('alt', '候診區的深綠色長椅與小圓桌');
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'false');

    // 從第 1 張往前要繞回最後一張。
    const previous = space.getByRole('button', { name: '上一張' });
    await previous.click();
    await expect(caption).toContainText('1 / 4');
    await previous.click();
    await expect(caption).toContainText('治療室');
    await expect(caption).toContainText('4 / 4');

    await thumbs.filter({ hasText: '診間' }).click();
    await expect(caption).toContainText('3 / 4');
    await expect(photo).toHaveAttribute(
      'src',
      '/clinic-assets/home-space-consult.webp'
    );
  });

  test('相簿連點時，晚到的照片不會蓋掉最後一次選擇', async ({ page }) => {
    // 讓候診區照片先卡住、等兩次點選都做完才放行：候診區解碼完成時已經不是
    // 最新的選擇，不可以把畫面換回去。
    let releaseLounge: () => void = () => {};
    const loungeHeld = new Promise<void>((resolve) => {
      releaseLounge = resolve;
    });
    await page.route(
      '**/clinic-assets/home-space-lounge.webp',
      async (route) => {
        await loungeHeld;
        await route.continue();
      }
    );
    // WebKit 的 load 事件會等所有圖片（包含被卡住的這張縮圖），所以只等 DOM。
    await page.goto('/clinic', { waitUntil: 'domcontentloaded' });
    const space = page.locator('#clinic-space');
    const photo = space.locator('.clinic-space__photo');
    const caption = space.locator('.clinic-space__caption');
    const thumbs = space.locator('.clinic-space__thumb');

    await thumbs.nth(1).click();
    await thumbs.nth(0).click();
    // 候診區還卡著，畫面停在原本的接待櫃檯，按鈕狀態已跟著最後一次點選。
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(caption).toContainText('1 / 4');

    const loungeArrived = page.waitForResponse('**/home-space-lounge.webp');
    releaseLounge();
    await loungeArrived;
    await page.waitForTimeout(500);
    await expect(caption).toContainText('接待櫃檯');
    await expect(caption).toContainText('1 / 4');
    await expect(photo).toHaveAttribute(
      'src',
      '/clinic-assets/home-space-reception.webp'
    );
  });

  test('行動選單可開啟並用 Escape 關閉', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/clinic');

    const menu = page.getByRole('button', { name: '選單' });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('navigation', { name: '診所網站導覽' })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('首頁預約按鈕接回患者預約頁', async ({ page }) => {
    await page.goto('/clinic');
    await page.getByRole('link', { name: '線上預約' }).last().click();

    await expect(page).toHaveURL('/booking');
    await expect(
      page.getByRole('heading', { level: 1, name: '線上門診預約' })
    ).toBeVisible();
  });

  // 業主 2026-10-12：社群平台直接用圖示呈現。圖示對報讀器隱藏，連結名稱仍是
  // 平台名稱；首屏只有圖示，門診資訊卡與頁尾另有看得見的名稱。
  test('社群平台以圖示呈現，連結名稱仍是平台名稱', async ({ page }) => {
    await page.goto('/clinic');
    for (const scope of ['.clinic-arrival', '#clinic-visit']) {
      const area = page.locator(scope);
      await expect(area.locator('a.clinic-social')).toHaveCount(4);
      for (const name of ['LINE', 'Instagram', 'Messenger', 'Facebook']) {
        const link = area.getByRole('link', { name, exact: true });
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link.locator('svg')).toHaveAttribute(
          'aria-hidden',
          'true'
        );
      }
    }
    const footer = page.locator('.clinic-footer__social a.clinic-social');
    await expect(footer).toHaveCount(3);
    await expect(footer.locator('svg path').first()).toBeAttached();
  });

  // 成因卡片是把原文「成因：細項、細項」拆開排版。拼回去必須與原文一字不差。
  test('止鼾頁的五個成因以卡片呈現，文字與原文一致', async ({ page }) => {
    await page.goto('/clinic/nasal/snoring-five-in-one');
    const cards = page.locator('.clinic-causes__item');
    await expect(cards).toHaveCount(5);
    const rebuilt = await cards.evaluateAll((items) =>
      items.map((item) => {
        const title = item
          .querySelector('h3')
          ?.textContent?.replace(/^\d+/, '')
          .trim();
        const details = [...item.querySelectorAll('li')].map((li) =>
          li.textContent?.trim()
        );
        return details.length > 0 ? `${title}：${details.join('、')}` : title;
      })
    );
    expect(rebuilt).toEqual([
      '體重過重',
      '鼻結構異常：鼻中膈彎曲、下鼻甲肥厚、過敏性鼻炎',
      '咽喉結構異常：舌頭肥厚後傾、軟顎無力、懸壅垂過長',
      '下巴短厚',
      '生活習慣欠佳：抽菸、酒精'
    ]);
    await expect(
      page.getByRole('heading', { level: 3, name: '鼻結構異常', exact: true })
    ).toBeVisible();
  });

  test('鼻中隔頁列出五種彎曲類型並附示意圖', async ({ page }) => {
    await page.goto('/clinic/nasal/septoplasty');
    const cards = page.locator('.clinic-septum__card');
    await expect(cards).toHaveCount(5);
    await expect(cards.locator('h3')).toHaveText([
      'C型彎曲',
      'S型彎曲',
      '尾端彎曲',
      '鼻中隔骨刺',
      '鼻中隔增生'
    ]);
    for (const card of await cards.all()) {
      const art = card.locator('svg.clinic-septum__art');
      await expect(art).toHaveAttribute('aria-hidden', 'true');
      await expect(art.locator('.clinic-septum__septum')).toHaveCount(1);
      await expect(art.locator('.clinic-septum__nostril')).not.toHaveCount(0);
    }
  });

  // 業主 2026-10-12 選定比較表的中性版：只有客觀項目，沒有排名與療效比較。這裡同時
  // 釘住「不能出現」的字眼，避免日後從原圖把它們加回來。
  test('下鼻甲頁的處理方式比較是中性版，附兩張器材照片', async ({ page }) => {
    await page.goto('/clinic/nasal/inferior-turbinate-surgery');
    const compare = page.locator('.clinic-compare');
    await expect(compare.locator('tbody th[scope="row"]')).toHaveText([
      '雙極射頻',
      '微創止鼾凝結消融',
      '傳統手術',
      '廣達雷射'
    ]);
    await expect(compare.locator('thead th')).toHaveText([
      '方式',
      '治療部位',
      '治療原理',
      '手術時間',
      '住院',
      '塞棉條'
    ]);
    const devices = compare.locator('.clinic-devices__card');
    await expect(devices).toHaveCount(2);
    for (const device of await devices.all()) {
      const img = device.locator('img');
      await expect(img).toHaveAttribute('alt', /器材/);
      // 屬性對了不代表檔案存在：捲到畫面內，確認真的解碼出寬度。
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          img.evaluate((node) => (node as HTMLImageElement).naturalWidth)
        )
        .toBeGreaterThan(0);
    }
    for (const banned of [
      '復發',
      '有效治療',
      '能有效維持功能',
      '破壞性最大',
      '出血量大',
      '舊式儀器',
      '溫度不均',
      '後遺症'
    ]) {
      await expect(page.locator('main')).not.toContainText(banned);
    }
  });

  // 牙套實品照取自業主投影片，只取牙套本身；投影片上的「有效治療」不得跟著出現。
  test('牙套頁有實品照，且沒有效果宣稱', async ({ page }) => {
    await page.goto('/clinic/nasal/snore-relief-mouthguard');
    const photo = page.locator('.clinic-product-photo img');
    await expect(photo).toHaveAttribute('alt', /牙套/);
    await expect(photo).toHaveAttribute(
      'src',
      '/clinic-assets/mouthguard-photo.webp'
    );
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        photo.evaluate((node) => (node as HTMLImageElement).naturalWidth)
      )
      .toBeGreaterThan(0);
    await expect(page.locator('main')).not.toContainText('有效治療');
  });

  test('療程重點以圖示標章呈現', async ({ page }) => {
    for (const path of CLINIC_ROUTES.map(([route]) => route).filter((route) =>
      route.startsWith('/clinic/nasal/')
    )) {
      await page.goto(path);
      const badges = page.locator('.clinic-highlight-list li');
      await expect(badges).toHaveCount(3);
      await expect(badges.locator('svg')).toHaveCount(3);
    }
  });
});

// 麵包屑的語意。axe 不檢查這幾項——它看得到 `<nav>` 有名稱、連結有文字，
// 但看不出外層該是 `<ol>`、當前頁該被標記、分隔符不該是真實文字節點。
// 那三個偏離就是這樣撐了很久沒被發現的，所以這裡逐項釘住。
//
// 路由取樣 import 自 `support/clinic-routes.ts`，**不在這裡另開陣列**。
test.describe('診所官網麵包屑語意', () => {
  // 只有詳情頁有麵包屑，但斷言寫成「有的話就必須合格」——這樣日後在別的路由
  // 加麵包屑，不必記得回來改這支測試。
  for (const path of CLINIC_UI_SCAN_ROUTES) {
    test(`${path} 的麵包屑（若有）是合格的清單`, async ({ page }) => {
      await page.goto(path);

      const nav = page.locator('nav.clinic-breadcrumb');
      if ((await nav.count()) === 0) return;

      // 外層是 `<ol>`：報讀器才會播報「清單，N 個項目」與目前位置。
      await expect(nav.locator('> ol')).toHaveCount(1);
      const items = nav.locator('ol > li');
      expect(await items.count()).toBeGreaterThan(1);

      // 當前頁明示 aria-current="page"。APG 對非連結的當前頁列為 optional，
      // 本專案一律要求——這是專案加嚴規則，不是 APG 的硬性要求。
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(items.last().locator('[aria-current="page"]')).toHaveCount(
        1
      );

      // 分隔符必須來自 CSS，不能是 DOM 裡的文字節點（那會被唸出來）。
      await expect(nav).not.toContainText('/');
    });
  }

  test('詳情頁確實有麵包屑', async ({ page }) => {
    for (const path of [
      '/clinic/doctors/yan-cheng-an',
      '/clinic/nasal/snoring-five-in-one'
    ]) {
      await page.goto(path);
      await expect(page.locator('nav.clinic-breadcrumb')).toHaveCount(1);
    }
  });
});

// This spec already runs in Chromium and WebKit. Exercise the served hashed
// module, not Node's interpretation of the browser-vendor source file.
test('預約入口載入的雜湊模組在瀏覽器拒絕非 UTC 時間', async ({ page }) => {
  const manifest: unknown = JSON.parse(
    await readFile('apps/web/asset-manifest.json', 'utf8')
  );
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('vendor/domain/index.js' in manifest)
  ) {
    throw new Error('Built domain entry is missing from the asset manifest.');
  }
  const modulePath = manifest['vendor/domain/index.js'];
  if (typeof modulePath !== 'string') {
    throw new Error('Built domain entry is not a path.');
  }
  expect(modulePath).not.toBe('vendor/domain/index.js');

  await page.goto('/clinic');
  await page
    .getByRole('link', {
      name: /線上預約|預約諮詢|預約門診|預約專業評估/
    })
    .first()
    .click();
  await expect(page).toHaveURL(/\/booking$/);

  const result = await page.evaluate(async (url) => {
    const rules = await import(url);
    const now = '2030-01-02T00:00:00.000Z';
    const startsAt = '2030-01-02T12:00:00.000Z';
    const job = {
      id: 'synthetic_utc_outbox',
      appointmentId: 'synthetic_utc_appointment',
      idempotencyKey: 'synthetic_utc_key',
      correlationId: 'synthetic_utc_correlation',
      causationId: 'synthetic_utc_causation',
      status: 'pending',
      attempts: 0
    };
    const closed = {
      id: 'synthetic_utc_payroll',
      managerId: 'synthetic_utc_manager',
      payrollPeriod: '2030-01',
      status: 'locked',
      creditCount: 1,
      closedAt: now
    };
    const adjustment = {
      id: 'synthetic_utc_adjustment',
      periodId: closed.id,
      managerId: closed.managerId,
      payrollPeriod: closed.payrollPeriod,
      sequence: 1,
      delta: 1,
      reasonCode: 'SYNTHETIC_UTC_CORRECTION',
      recordedAt: startsAt,
      resultingCreditCount: 2
    };
    const invalid = [
      '2030-02-30T01:00:00Z',
      '2030-01-02T01:00:00+08:00',
      '2030-01-02 01:00:00Z'
    ];
    const probes = [
      {
        code: 'INVALID_VALUE',
        run: (value: string) => rules.selfCancelCutoffAt(value)
      },
      {
        code: 'INVALID_VALUE',
        run: (value: string) => rules.assertSlotMeetsEarliestLead(value, now)
      },
      {
        code: 'INVALID_VALUE',
        run: (value: string) =>
          rules.assertSlotMeetsEarliestLead(startsAt, value)
      },
      {
        code: 'CANCELLATION_WINDOW_CLOSED',
        run: (value: string) =>
          rules.assertWithinSelfCancelWindow(startsAt, value)
      },
      {
        code: 'CANCELLATION_WINDOW_CLOSED',
        run: (value: string) =>
          rules.assertWithinSelfRescheduleWindow(startsAt, value)
      },
      {
        code: 'INVALID_VALUE',
        run: (value: string) => rules.taipeiCalendarDate(value)
      },
      {
        code: 'INVALID_VALUE',
        run: (value: string) => rules.assertSlotNotInPast(value, now)
      },
      {
        code: 'INVALID_VALUE',
        run: (value: string) => rules.assertSlotWithinBookingHorizon(value, now)
      },
      {
        code: 'INVALID_TIMESTAMP',
        run: (value: string) =>
          rules.planOutboxAttempt(job, { kind: 'succeeded' }, value)
      },
      {
        code: 'INVALID_TIMESTAMP',
        run: (value: string) =>
          rules.payrollTotalAfterAdjustments({ ...closed, closedAt: value }, [])
      },
      {
        code: 'INVALID_TIMESTAMP',
        run: (value: string) =>
          rules.payrollTotalAfterAdjustments(closed, [
            { ...adjustment, recordedAt: value }
          ])
      }
    ];
    const failures: string[] = [];
    for (const value of invalid) {
      if (rules.isDue(job, value)) {
        failures.push(`outbox:accepted:${value}`);
      }
      if (rules.isOnBookingKindGrid(value, 'initial')) {
        failures.push(`grid:accepted:${value}`);
      }
      if (rules.toBusinessExportRow({ startsAt: value }).startsAt !== null) {
        failures.push(`export:accepted:${value}`);
      }
      for (const [index, probe] of probes.entries()) {
        try {
          probe.run(value);
          failures.push(`${index}:accepted:${value}`);
        } catch (error) {
          const code =
            typeof error === 'object' && error !== null && 'code' in error
              ? error.code
              : undefined;
          if (code !== probe.code)
            failures.push(`${index}:wrong-code:${value}`);
        }
      }
    }
    const accepted = [
      '2030-01-02T12:00:00Z',
      '2030-01-02T12:00:00.123Z',
      '2030-01-02T12:00:00.123456Z',
      '2030-01-02T12:00:00.123456789Z'
    ].map((value) => {
      if (!rules.isDue(job, value)) {
        throw new Error('Valid UTC outbox clock was rejected.');
      }
      rules.planOutboxAttempt(job, { kind: 'succeeded' }, value);
      rules.payrollTotalAfterAdjustments({ ...closed, closedAt: value }, []);
      rules.payrollTotalAfterAdjustments(closed, [
        { ...adjustment, recordedAt: value }
      ]);
      if (
        !rules.isOnBookingKindGrid(value, 'initial') ||
        rules.toBusinessExportRow({ startsAt: value }).startsAt === null
      ) {
        throw new Error('Valid UTC grid/export input was rejected.');
      }
      rules.assertWithinSelfCancelWindow(value, now);
      rules.assertWithinSelfRescheduleWindow(value, now);
      rules.assertSlotMeetsEarliestLead(value, now);
      rules.assertSlotNotInPast(value, now);
      rules.assertSlotWithinBookingHorizon(value, now);
      return rules.selfCancelCutoffAt(value);
    });
    for (const value of [
      'Jan 02 2030 Z',
      '2030-01-02',
      '2030-01-02 01:00:00Z',
      '2030-01-02T01:00:00',
      '2030-02-30T01:00:00Z',
      '2030-02-30T01:00:00+08:00',
      '2030-01-02T24:00:00Z',
      '2030-01-02T24:00:00+08:00'
    ]) {
      for (const field of ['start', 'end']) {
        const input = {
          summary: '[忙碌] 會議',
          start: { dateTime: field === 'start' ? value : '2029-01-01T00:00:00Z' },
          end: { dateTime: field === 'end' ? value : '2030-12-31T23:59:59Z' }
        };
        if (rules.extractCalendarEventRange(input) !== undefined) {
          failures.push(`provider-projection:${field}:${value}`);
        }
        const parsed = rules.parseCalendarEntry(input, new Set());
        if (parsed.ok || !parsed.errors.includes('time_invalid')) {
          failures.push(`provider-entry:${field}:${value}`);
        }
      }
    }
    for (const value of [
      '2030-01-02T12:00:00Z',
      '2030-01-02T12:00:00+00:00',
      '2030-01-02T12:00:00+08:00',
      '2030-01-02T12:00:00-07:00',
      '2030-01-02T12:00:00.123456789+08:00',
      '2030-01-02t12:00:00z'
    ]) {
      const input = {
        summary: '[忙碌] 會議',
        start: { dateTime: value },
        end: { dateTime: '2030-12-31T23:59:59Z' }
      };
      const expected = new Date(value).toISOString();
      const range = rules.extractCalendarEventRange(input);
      const parsed = rules.parseCalendarEntry(input, new Set());
      if (range?.startsAt !== expected || !parsed.ok || parsed.startsAt !== expected) {
        failures.push(`provider-valid:${value}`);
      }
    }
    return { failures, accepted };
  }, `/${modulePath}`);

  expect(result.failures).toEqual([]);
  expect(result.accepted).toEqual([
    '2030-01-02T02:00:00.000Z',
    '2030-01-02T02:00:00.000Z',
    '2030-01-02T02:00:00.000Z',
    '2030-01-02T02:00:00.000Z'
  ]);
});
