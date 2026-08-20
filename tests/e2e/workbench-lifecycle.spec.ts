import { expect, test, type Page } from '@playwright/test';

import {
  createBooking,
  login,
  seedAppointmentCopies,
  showAllAppointments
} from './support/workbench.js';

// 工作臺的完整生命週期：登入 → 建立 → 到診 → 回診 → 刪除，跑在打包後的產物上。
// 這條路徑同時覆蓋這個 session 新做的兩件事——管理者限定的刪除（含理由彈窗）
// 與登入閘門——確保它們在真瀏覽器裡真的接得起來，而不只是單元測試裡的函式。

/**
 * 確定性地觀察一個瞬間狀態：在動作**之前**掛上 MutationObserver，記錄變更本身，
 * 因此即使狀態只存在一個 tick 也抓得到。回傳期間出現過的按鈕文字。
 */
async function recordLabelsDuring(
  page: Page,
  selector: string,
  act: () => Promise<void>
): Promise<string[]> {
  await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (element === null) throw new Error(`找不到 ${target}`);
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const text = node.textContent?.trim();
          if (text !== undefined && text !== '') seen.push(text);
        }
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    Object.assign(window, { __labelSeen: seen, __labelObserver: observer });
  }, selector);

  await act();

  return page.evaluate(() => {
    const scope = window as unknown as {
      __labelSeen: string[];
      __labelObserver: MutationObserver;
    };
    scope.__labelObserver.disconnect();
    return scope.__labelSeen;
  });
}

// 階段 4：首頁從「功能目錄」改成「情境式指揮中心」。這一組驗的是三條原則本身
// ——零筆不出現、依急迫性排序、全部清空時保持安靜——而不是某一張卡片的文案。
test.describe('營運首頁指揮中心', () => {
  test('沒有待辦時保持安靜，不顯示一排零', async ({ page }) => {
    await login(page);
    await page.goto('/#overview');

    // 先前這裡永遠有四張卡片，數量為零也照顯示——於是「0 筆」和「3 筆」佔一樣
    // 大的版面，畫面沒辦法告訴任何人現在該做什麼。
    await expect(page.locator('#task-list .task-card')).toHaveCount(0);
    await expect(page.locator('.tasks-clear')).toContainText('沒有待辦');
    await expect(page.locator('#task-summary')).toHaveText('目前沒有待辦事項');
    await expect(page.locator('#next-up')).toContainText(
      '沒有已確認的後續預約'
    );
  });

  test('待辦依急迫性排序，零筆的不出現，最急的放大', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);
    // 完成到診會同時產生「回診尚未決定」與「個管尚未指派」兩類待辦。
    await page
      .locator('[data-appointment-card]')
      .first()
      .locator('[data-appointment-action="complete"]')
      .click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#status')).toContainText('到診已記錄');

    await page.goto('/#overview');
    const cards = page.locator('#task-list .task-card');
    await expect(cards.first()).toContainText('回診尚未決定');

    // 「取消待確認」是零筆，所以整張卡不該存在——這正是階段 4 的重點。
    await expect(
      page.locator('#task-list .task-card', { hasText: '取消待確認' })
    ).toHaveCount(0);

    // 最急的那一件放大成整列，讓版面自己說出「先處理這個」。
    const lead = page.locator('#task-list .task-card.task-lead');
    await expect(lead).toHaveCount(1);
    await expect(lead).toContainText('回診尚未決定');
    const [leadWidth, gridWidth] = await Promise.all([
      lead.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
      page
        .locator('#task-list')
        .evaluate((el) => Math.round(el.getBoundingClientRect().width))
    ]);
    expect(leadWidth).toBe(gridWidth);

    // 每張卡都要說明「為什麼要處理」，否則排序的理由只存在於程式碼裡。
    await expect(lead.locator('.task-why')).not.toBeEmpty();
  });

  test('下一位只看已確認且還沒到的最早一筆', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto('/#overview');

    // 「下一位」是櫃台整天問最多次的問題，先前首頁完全沒有。
    await expect(page.locator('#next-up')).toContainText('測試患者甲');
    await expect(page.locator('#next-up .next-up-time strong')).not.toBeEmpty();

    // 完成到診之後那一筆就不再是「下一位」——它已經不是 confirmed 了。
    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    await page
      .locator('[data-appointment-card]')
      .first()
      .locator('[data-appointment-action="complete"]')
      .click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#status')).toContainText('到診已記錄');

    await page.goto('/#overview');
    await expect(page.locator('#next-up')).toContainText(
      '沒有已確認的後續預約'
    );
  });

  test('待辦清單不是 live region，由摘要公告件數', async ({ page }) => {
    await login(page);
    await page.goto('/#overview');
    // 整批置換的容器掛 aria-live 會被螢幕閱讀器逐項重唸。全站一致：live 掛在
    // 簡短摘要上。
    await expect(page.locator('#task-list')).not.toHaveAttribute(
      'aria-live',
      /.*/
    );
    await expect(page.locator('#task-summary')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });
});

test.describe('待處理狀態', () => {
  test('送出期間按鈕會換成忙碌文字，且不設 aria-busy', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');

    const labels = await recordLabelsDuring(
      page,
      '#login-view button[type="submit"]',
      async () => {
        await page.locator('#login-view button[type="submit"]').click();
        await expect(page.locator('#logout')).toBeVisible();
      }
    );

    // 忙碌文字確實出現過——即使它只存在一瞬間。
    expect(labels).toContain('登入中…');

    // 按鈕不該帶 aria-busy：那是 live region／複合元件的屬性，會把元素自己的
    // 子內容對輔助技術隱藏，等於在忙碌期間讓按鈕失去名稱。狀態改由
    // role="status" 的狀態列公告。
    await expect(page.locator('#status')).toHaveAttribute('role', 'status');
    expect(
      await page.locator('[aria-busy="true"]').count(),
      '不應該有任何元素停在 aria-busy'
    ).toBe(0);
  });

  test('結果清單不是 live region，避免整張表被重唸', async ({ page }) => {
    await login(page);
    await page.goto('/#appointments-section');

    // 清單內容整批換掉，若掛 aria-live，螢幕閱讀器會在每次篩選時把整張表逐列
    // 重唸一次。變化由簡短的筆數摘要公告就夠了。
    await expect(page.locator('#appointments')).not.toHaveAttribute(
      'aria-live',
      /.*/
    );
    await expect(page.locator('#appointment-result-summary')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });
});

test.describe('櫃台處理清單', () => {
  test('是一張欄位對齊的資料表，不是一疊卡片', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);

    const table = page.locator('#appointments table.appointment-table');
    await expect(table).toBeVisible();
    // 第一欄是批次選取。可排序的欄名帶著方向箭頭，所以用 toContainText 逐欄比對，
    // 不比整串文字。
    const headers = table.locator('thead th');
    await expect(headers).toHaveCount(7);
    for (const [index, label] of [
      '選取',
      '時間',
      '患者',
      '掛號別',
      '療程',
      '狀態',
      '處置'
    ].entries())
      await expect(headers.nth(index)).toContainText(label);

    // 表格存在的理由就是垂直對齊——同一欄在每一列的左緣要一致，否則櫃台沒辦法
    // 靠掃描比對時間與姓名，那正是卡片做不到的事。
    const rows = table.locator('tbody tr[data-appointment-card]');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    if (count > 1) {
      const lefts = async (index: number) =>
        rows
          .nth(index)
          .locator('td')
          .evaluateAll((cells) =>
            cells.map((cell) => Math.round(cell.getBoundingClientRect().left))
          );
      expect(await lefts(0)).toEqual(await lefts(1));
    }

    // 螢幕閱讀器要知道這張表是什麼；視覺標題在表格外面，所以用 caption。
    await expect(table.locator('caption')).toHaveText(/櫃台處理清單/);

    // 表格語意必須用 ARIA role 明確標出來。手機版把 table/tr/td 改成
    // `display: block` 來堆疊，而改變 display 會讓瀏覽器把表格語意從無障礙樹上
    // 拿掉——沒有這些 role，螢幕閱讀器在手機上就不再把它當表格。
    await expect(table).toHaveAttribute('role', 'table');
    await expect(table.locator('thead')).toHaveAttribute('role', 'rowgroup');
    await expect(table.locator('tbody')).toHaveAttribute('role', 'rowgroup');
    await expect(rows.first()).toHaveAttribute('role', 'row');
    await expect(rows.first().locator('td').first()).toHaveAttribute(
      'role',
      'cell'
    );
    await expect(table.locator('thead th').first()).toHaveAttribute(
      'role',
      'columnheader'
    );
  });

  test('手機寬度改成堆疊，每格仍帶著欄位名', async ({ page }) => {
    // 先在桌機寬度登入並建資料：手機版把工具列收進 <details>，`loginAsAdmin`
    // 等的 #logout 因此不可見。要驗的是表格的手機版版面，不是登入流程。
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);
    await page.setViewportSize({ width: 390, height: 900 });

    // 第一欄是選取方塊，時間在第二欄。
    const timeCell = page
      .locator('#appointments tbody tr[data-appointment-card] td')
      .nth(1);
    // 表頭在手機上收起來，欄位名改由每一格的 ::before 帶出來——資訊不能因為
    // 表頭消失就跟著不見。
    await expect(timeCell).toHaveAttribute('data-label', '時間');
    const label = await timeCell.evaluate(
      (cell) => window.getComputedStyle(cell, '::before').content
    );
    expect(label).toContain('時間');
  });
});

test.describe('欄位排序', () => {
  test('依 APG：aria-sort 一次只有一欄，欄名是按鈕，可來回切換', async ({
    page
  }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);

    const table = page.locator('#appointments table.appointment-table');
    const sorted = table.locator('thead th[aria-sort]');
    // 進場預設依時間遞增，而且**只有那一欄**帶 aria-sort。
    await expect(sorted).toHaveCount(1);
    await expect(sorted).toContainText('時間');
    await expect(sorted).toHaveAttribute('aria-sort', 'ascending');

    // 可排序的欄名要包成 button，鍵盤操作才由瀏覽器原生提供。
    await expect(
      table.locator('thead th button[data-sort-column]')
    ).toHaveCount(5);

    // 點另一欄：排序換過去，原本那欄不再帶 aria-sort（同時只有一欄）。
    await table.locator('[data-sort-column="patient"]').click();
    await expect(table.locator('thead th[aria-sort]')).toHaveCount(1);
    await expect(table.locator('thead th[aria-sort]')).toContainText('患者');
    await expect(table.locator('thead th[aria-sort]')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );

    // 再點同一欄：切成遞減。
    await table.locator('[data-sort-column="patient"]').click();
    await expect(table.locator('thead th[aria-sort]')).toHaveAttribute(
      'aria-sort',
      'descending'
    );

    // 重畫會換掉整個表頭；焦點必須留在剛按的那一顆，否則鍵盤使用者每按一次
    // 就得重新找位置。
    await expect(table.locator('[data-sort-column="patient"]')).toBeFocused();
  });
});

test.describe('預約清單分頁', () => {
  test('每頁 20 筆，總數與本頁筆數分開，換頁不保留前頁批次選取', async ({
    page
  }) => {
    await login(page);
    await createBooking(page);
    await seedAppointmentCopies(page, 25);
    await showAllAppointments(page);

    const rows = page.locator('#appointments tbody tr[data-appointment-card]');
    const status = page.locator('#appointment-page-status');
    const previous = page.locator('#appointment-page-prev');
    const next = page.locator('#appointment-page-next');

    await expect(rows).toHaveCount(20);
    await expect(page.locator('#appointment-result-summary')).toHaveText(
      '共 25 筆結果，本頁顯示 20 筆（第 1 頁，共 2 頁）'
    );
    await expect(status).toHaveText('第 1 頁，共 2 頁');
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await page.locator('#appointment-select-all').check();
    await expect(page.locator('#appointment-selection-summary')).toHaveText(
      '本頁已選取 20 筆'
    );

    await next.click();
    await expect(rows).toHaveCount(5);
    await expect(page.locator('#appointment-result-summary')).toHaveText(
      '共 25 筆結果，本頁顯示 5 筆（第 2 頁，共 2 頁）'
    );
    await expect(status).toHaveText('第 2 頁，共 2 頁');
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();
    await expect(page.locator('#appointment-select-all')).not.toBeChecked();
    await expect(page.locator('#appointment-selection-summary')).toHaveText(
      '未選取本頁任何預約'
    );
  });

  test('篩選、查詢與排序改變後都回到第 1 頁', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await seedAppointmentCopies(page, 25);
    await showAllAppointments(page);

    const status = page.locator('#appointment-page-status');
    const next = page.locator('#appointment-page-next');
    await next.click();
    await expect(status).toHaveText('第 2 頁，共 2 頁');

    await page.locator('#appointment-kind-filter').selectOption('initial');
    await expect(status).toHaveText('第 1 頁，共 2 頁');

    await next.click();
    await page.locator('#appointment-search').fill('測試患者甲');
    await expect(status).toHaveText('第 1 頁，共 2 頁');

    await next.click();
    await page.locator('[data-sort-column="patient"]').click();
    await expect(status).toHaveText('第 1 頁，共 2 頁');
  });
});

test.describe('櫃台快捷鍵', () => {
  test('/ 聚焦搜尋，Alt+N 只開啟表單並聚焦第一欄', async ({ page }) => {
    await login(page);
    await page.goto('/#appointments-section');

    await expect(page.locator('.shortcut-hint')).toContainText('鍵盤快捷鍵');

    await page.locator('#appointment-filter-reset').focus();
    await page.keyboard.press('/');
    await expect(page.locator('#appointment-search')).toBeFocused();

    // 搜尋框是可編輯欄位；Alt+N 在這裡不能搶走輸入焦點或展開建檔流程。
    await page.keyboard.press('Alt+N');
    await expect(page.locator('#appointment-search')).toBeFocused();
    expect(
      await page
        .locator('#booking-workflow')
        .evaluate((element) => (element as HTMLDetailsElement).open)
    ).toBe(false);

    await page.locator('#appointment-filter-reset').focus();
    await page.keyboard.press('Alt+N');
    await expect(page.locator('#booking-name')).toBeFocused();
    expect(
      await page
        .locator('#booking-workflow')
        .evaluate((element) => (element as HTMLDetailsElement).open)
    ).toBe(true);
    await expect(page.locator('[data-appointment-card]')).toHaveCount(0);

    // 在 input 裡輸入斜線就是文字，不應重新導覽或移走焦點。
    await page.locator('#booking-name').fill('');
    await page.keyboard.press('/');
    await expect(page.locator('#booking-name')).toHaveValue('/');
    await expect(page.locator('#booking-name')).toBeFocused();
  });

  test('textarea、select 與 contenteditable 內不觸發 Alt+N', async ({
    page
  }) => {
    await login(page);
    await page.goto('/#communications-section');
    await page.locator('#announcement-body').focus();
    await page.keyboard.press('Alt+N');
    await expect(page.locator('#announcement-body')).toBeFocused();

    await page.goto('/#appointments-section');
    await page.locator('#appointment-kind-filter').focus();
    await page.keyboard.press('Alt+N');
    await expect(page.locator('#appointment-kind-filter')).toBeFocused();

    await page.locator('#booking-workflow').evaluate(() => {
      const editable = document.createElement('div');
      editable.id = 'shortcut-contenteditable-test';
      editable.contentEditable = 'true';
      editable.textContent = '測試輸入區';
      document.body.append(editable);
      editable.focus();
    });
    await page.keyboard.press('Alt+N');
    await expect(page.locator('#shortcut-contenteditable-test')).toBeFocused();
    expect(
      await page
        .locator('#booking-workflow')
        .evaluate((element) => (element as HTMLDetailsElement).open)
    ).toBe(false);
  });
});

test.describe('批次選取與批次操作', () => {
  test('全選在表格外、每列名稱各不相同、狀態不符時停用', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);

    // 「全選」必須在表格外面。放進選取欄的表頭，它會變成底下每個選取方塊的
    // 欄位名，於是每一列都被唸成「全選」。
    await expect(
      page.locator('#appointment-batch-bar #appointment-select-all')
    ).toBeVisible();
    await expect(
      page.locator('table.appointment-table thead input[type="checkbox"]')
    ).toHaveCount(0);

    // 每一列的選取方塊都要有自己的名稱，且帶得出是誰。
    const firstBox = page.locator('[data-appointment-select]').first();
    await expect(firstBox).toHaveAttribute('aria-label', /選取 .+/);

    // 沒選任何一筆時批次處置停用。
    const batchNoShow = page.locator('#appointment-batch-no-show');
    await expect(batchNoShow).toBeDisabled();

    await firstBox.check();
    await expect(page.locator('#appointment-selection-summary')).toHaveText(
      '本頁已選取 1 筆'
    );
    await expect(batchNoShow).toBeEnabled();

    // 全選方塊在「部分選取」時要是 indeterminate（無障礙 API 的 mixed）。
    // 這一筆是唯一一列，所以直接會是全選；改用兩列的情境在下一個測試裡。
    await page.locator('#appointment-selection-clear').click();
    await expect(page.locator('#appointment-selection-summary')).toHaveText(
      '未選取本頁任何預約'
    );
  });

  test('批次標記未到只動選取的那幾筆，並照實回報筆數', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await createBooking(page, {
      name: '測試患者乙',
      phone: '0922333444',
      nationalId: 'A222333444'
    });
    await showAllAppointments(page);

    const boxes = page.locator('[data-appointment-select]');
    await expect(boxes).toHaveCount(2);

    // 只勾第一筆。
    await boxes.first().check();
    // 部分選取 → 全選方塊是 indeterminate。
    expect(
      await page
        .locator('#appointment-select-all')
        .evaluate((box) => (box as HTMLInputElement).indeterminate)
    ).toBe(true);

    await page.locator('#appointment-batch-no-show').click();
    await page.locator('.confirm-dialog button.button-danger').click();

    // 選到的那筆變成「未到」，另一筆完全沒被動到——批次不該波及沒勾的列。
    await expect(page.locator('#status')).toContainText('1 筆已標記未到');
    // 比對狀態欄裡的那顆 chip，不要整列比文字：「更多處置」選單裡也有一顆
    // 叫「未到」的按鈕，整列比會把還沒處理的那一列也算進去。
    const statusChips = page.locator(
      'tr[data-appointment-card] td[data-label="狀態"] .status-chip'
    );
    await expect(statusChips.filter({ hasText: '未到' })).toHaveCount(1);
    await expect(statusChips.filter({ hasText: '預約成立' })).toHaveCount(1);
  });
});

// 階段 3 把其餘四區也改成資料表。這一組驗的是「每一張表都照同一套規則做」，
// 而不是逐張重驗欄位內容——欄名會隨營運需求調整，結構規則不會。
test.describe('工作臺其餘資料表', () => {
  // 每張表的：所在分頁、選擇器、caption 關鍵字、第一欄的欄位名。
  const TABLES = [
    [
      '#schedule-section',
      '#published-schedule table.schedule-table',
      '每週固定看診時段',
      '星期'
    ],
    [
      '#accounts-section',
      '#account-list table.account-table',
      '員工帳號',
      '帳號'
    ],
    ['#audit-section', '#audit-events table.audit-table', '稽核事件', '事件']
  ] as const;

  for (const [panel, selector, caption, firstLabel] of TABLES) {
    test(`${selector} 是帶完整表格語意的資料表`, async ({ page }) => {
      await login(page);
      await page.goto(`/${panel}`);

      const table = page.locator(selector).first();
      await expect(table).toBeVisible();

      // 手機版用 display:block 堆疊，會讓瀏覽器把表格語意從無障礙樹拿掉，
      // 所以 role 必須明確寫出來——這是整組表格共用的規則。
      await expect(table).toHaveAttribute('role', 'table');
      await expect(table.locator('thead')).toHaveAttribute('role', 'rowgroup');
      await expect(table.locator('tbody')).toHaveAttribute('role', 'rowgroup');
      await expect(table.locator('caption')).toContainText(caption);
      await expect(table.locator('thead th').first()).toHaveAttribute(
        'role',
        'columnheader'
      );

      const firstCell = table.locator('tbody tr td').first();
      await expect(firstCell).toHaveAttribute('role', 'cell');
      // 表頭在手機上收起來，欄位名靠每一格的 data-label 帶回來。
      await expect(firstCell).toHaveAttribute('data-label', firstLabel);
    });
  }

  test('已發布排班沒有操作欄，草稿才有', async ({ page }) => {
    await login(page);
    await page.goto('/#schedule-section');

    // 只有草稿能改。不可編輯的版本留一個空的「操作」欄，會讓人以為功能壞了。
    await expect(
      page.locator('#published-schedule table').first().locator('thead th')
    ).toHaveText(['星期', '時段']);
    await expect(
      page.locator('#draft-schedule table').first().locator('thead th')
    ).toHaveText(['星期', '時段', '操作']);
  });

  test('個管指派：送出鈕會觸發 frozen boundary', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);
    // 先完成到診，個案才會出現在指派表裡。
    await page
      .locator('[data-appointment-card]')
      .first()
      .locator('[data-appointment-action="complete"]')
      .click();
    await page.locator('.confirm-dialog button.button-primary').click();

    await page.goto('/#case-section');
    const row = page
      .locator('#case-assignment-list tbody tr[data-case-row]')
      .first();
    await expect(row).toBeVisible();
    await expect(row.locator('.status-chip')).toHaveText('待指派');

    // `<form>` 不能包住 `<tr>`，所以送出鈕靠 form 屬性從操作格關聯回去。
    // Phase B 仍保留相容入口；收到 frozen error 證明按鈕真的送達 store boundary。
    await row.locator('button[type="submit"][form]').click();
    await expect(page.locator('#status')).toContainText(
      '個案管理功能目前未開放'
    );
    await expect(row.locator('.status-chip')).toHaveText('待指派');
  });

  test('手機寬度下每個工作區都不產生水平捲軸', async ({ page }) => {
    // 迴歸測試：收起來的 thead 原本只設了 clip-path 與 absolute，沒有縮成 1×1，
    // 因此仍以「所有欄名並排」的寬度佔著版面，把個案管理分頁撐出 31px 的水平
    // 捲軸。資料表是分頁內容，responsive.spec.ts 只量得到登入後的預設分頁，
    // 所以這裡逐一切過每一個工作區。
    await login(page);
    await page.setViewportSize({ width: 375, height: 812 });

    for (const panel of [
      '#schedule-section',
      '#case-section',
      '#accounts-section',
      '#audit-section'
    ]) {
      await page.goto(`/${panel}`);
      await expect(page.locator(panel)).toBeVisible();
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth - root.clientWidth;
      });
      expect(overflow, `${panel} 不應該有水平捲軸`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('工作臺預約生命週期', () => {
  test('登入→建立→到診→回診→刪除', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await showAllAppointments(page);

    const card = page.locator('[data-appointment-card]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('預約成立');

    // 到診：卡片上的主要動作按鈕，確認彈窗按「確認到診」（非破壞性，主要色）。
    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('[data-appointment-card]').first()).toContainText(
      '已完成到診'
    );

    // 回診：完成到診後於逐筆回診確認記錄「需要回診」；表單就在同一頁，不需重載。
    const followUpForm = page
      .locator('#follow-up-list [data-follow-up-form]')
      .first();
    await expect(followUpForm).toBeVisible();
    await followUpForm
      .locator('select[name="status"]')
      .selectOption('required');
    // 目標日期／時間預設已落在第一個有回診時段的門診日，直接存檔。
    await followUpForm.locator('button[type="submit"]').click();

    // 存檔後該筆變成「待安排回診」的回診版卡片。
    const followUpCard = page.locator('[data-follow-up-pending]').first();
    await expect(followUpCard).toBeVisible();

    // 這一列只有三個動作、**沒有下拉選單、也沒有「刪除紀錄」**：刪除是清掉整筆
    // 看診事實，拿它表達「不用回診了」是錯的。要撤銷回診請用「取消回診」。
    await expect(followUpCard.locator('.action-menu')).toHaveCount(0);
    await expect(
      followUpCard.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);

    // 取消回診：回診需求撤銷、日曆提醒移除，但**已完成的到診紀錄要留著**。
    await followUpCard.locator('[data-follow-up-cancel]').click();
    await page.locator('.confirm-dialog button.button-danger').click();
    await expect(page.locator('#status')).toContainText('回診已取消');
    await expect(page.locator('[data-follow-up-pending]')).toHaveCount(0);

    const completedRow = page.locator('[data-appointment-card]').first();
    await expect(completedRow).toContainText('已完成到診');

    // 刪除（管理者限定）仍在。已完成的預約只剩「刪除紀錄」一個次要處置，因此它
    // **直接是一顆按鈕、不再包在「更多處置」下拉裡**——把唯一的選項藏起來只是多
    // 一次點擊。
    await expect(completedRow.locator('.action-menu')).toHaveCount(0);
    await completedRow.locator('[data-appointment-action="delete"]').click();
    const dialog = page.locator('.confirm-dialog');
    await expect(dialog.locator('.confirm-dialog-reason')).toBeVisible();
    await dialog.locator('select').selectOption('wrong_patient');
    await dialog.locator('button.button-danger').click();

    // 刪除後清單不再有任何預約卡。
    await expect(page.locator('[data-appointment-card]')).toHaveCount(0);
  });

  test('櫃台帳號看不到刪除入口', async ({ page }) => {
    // 先以管理者建立一筆，再以櫃台登入檢查刪除入口缺席。
    await login(page);
    await createBooking(page);
    await page.locator('#logout').click();

    await expect(page.locator('#login-view')).toBeVisible();
    await page.locator('#login-account').fill('front');
    await page.locator('#login-password').fill('beauessence-front');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();

    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card]').first();
    await expect(card).toBeVisible();
    // 打開「更多處置」選單也沒有刪除項。
    await card.locator('summary').click();
    await expect(
      card.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);
  });
});
