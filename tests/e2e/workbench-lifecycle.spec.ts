import { expect, test, type Page } from '@playwright/test';

// 工作臺的完整生命週期：登入 → 建立 → 到診 → 回診 → 刪除，跑在打包後的產物上。
// 這條路徑同時覆蓋這個 session 新做的兩件事——管理者限定的刪除（含理由彈窗）
// 與登入閘門——確保它們在真瀏覽器裡真的接得起來，而不只是單元測試裡的函式。

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#login-account').fill('admin');
  await page.locator('#login-password').fill('beauessence-admin');
  const loginButton = page.locator('#login-view button[type="submit"]');
  await loginButton.click();
  // 這裡**不驗**「登入中…」那個瞬間狀態。`toHaveText` 是動作之後才開始輪詢，
  // 若忙碌狀態在輪詢開始前就結束（本機動作往往如此），斷言永遠等不到——那正是
  // 這個 helper 先前間歇性紅燈的原因。忙碌狀態改由下面的專屬測試以
  // MutationObserver 確定性地觀察。
  await expect(page.locator('#login-view')).toBeHidden();
  await expect(page.locator('#logout')).toBeVisible();
}

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

async function createBooking(page: Page): Promise<void> {
  await page.goto('/#appointments-section');
  // 建立預約的表單收在一個 <details> 裡，先展開。
  await page.locator('#booking-workflow').evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await page.locator('#booking-name').fill('測試患者甲');
  await page.locator('#booking-phone').fill('0912345678');
  await page.locator('#booking-birth').fill('1990-05-20');
  await page.locator('#booking-national-id').fill('A123456789');
  await page.locator('#booking-kind').selectOption('initial');
  // 選第一個可預約時段，再送出建立。
  await page.locator('#slots [data-select-slot]').first().click();
  await page.locator('#booking-form button[type="submit"]').click();
  // 同上：只等最終狀態。建立成功的證據是清單多一筆，各測試自己驗。
  await expect(page.locator('#booking-form-status')).toBeVisible();
}

// 合成資料是 2030 年，預設「當日」篩選看不到；切到「全部狀態」才會列出。
async function showAllAppointments(page: Page): Promise<void> {
  await page.locator('#appointment-status-filter').selectOption('all');
}

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
    await loginAsAdmin(page);
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
    await loginAsAdmin(page);
    await createBooking(page);
    await showAllAppointments(page);

    const table = page.locator('#appointments table.appointment-table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveText([
      '時間',
      '患者',
      '掛號別',
      '療程',
      '狀態',
      '處置'
    ]);

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
    await loginAsAdmin(page);
    await createBooking(page);
    await showAllAppointments(page);
    await page.setViewportSize({ width: 390, height: 900 });

    const firstCell = page
      .locator('#appointments tbody tr[data-appointment-card] td')
      .first();
    // 表頭在手機上收起來，欄位名改由每一格的 ::before 帶出來——資訊不能因為
    // 表頭消失就跟著不見。
    await expect(firstCell).toHaveAttribute('data-label', '時間');
    const label = await firstCell.evaluate(
      (cell) => window.getComputedStyle(cell, '::before').content
    );
    expect(label).toContain('時間');
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
      await loginAsAdmin(page);
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
    await loginAsAdmin(page);
    await page.goto('/#schedule-section');

    // 只有草稿能改。不可編輯的版本留一個空的「操作」欄，會讓人以為功能壞了。
    await expect(
      page.locator('#published-schedule table').first().locator('thead th')
    ).toHaveText(['星期', '時段']);
    await expect(
      page.locator('#draft-schedule table').first().locator('thead th')
    ).toHaveText(['星期', '時段', '操作']);
  });

  test('個管指派：送出鈕與表單不同格，仍然送得出去', async ({ page }) => {
    await loginAsAdmin(page);
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

    // `<form>` 不能包住 `<tr>`，所以表單放在「個案管理師」那一格，送出鈕靠
    // form 屬性從「操作」格關聯回去。這個關聯壞掉的話按鈕會完全沒反應，
    // 而且不會有任何錯誤訊息——所以這裡直接驗它有沒有真的送出。
    await row.locator('button[type="submit"][form]').click();
    await expect(row.locator('.status-chip')).toHaveText('已指派');

    // 指派完成會重算月度統計，數字欄靠右對齊才比得動。
    const workload = page.locator('#workload table.workload-table');
    await expect(workload).toBeVisible();
    await expect(workload.locator('tbody tr')).toHaveCount(1);
    await expect(workload.locator('td.numeric').first()).toHaveCSS(
      'text-align',
      'right'
    );
  });

  test('手機寬度下每個工作區都不產生水平捲軸', async ({ page }) => {
    // 迴歸測試：收起來的 thead 原本只設了 clip-path 與 absolute，沒有縮成 1×1，
    // 因此仍以「所有欄名並排」的寬度佔著版面，把個案管理分頁撐出 31px 的水平
    // 捲軸。資料表是分頁內容，responsive.spec.ts 只量得到登入後的預設分頁，
    // 所以這裡逐一切過每一個工作區。
    await loginAsAdmin(page);
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
    await loginAsAdmin(page);
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

    // 刪除（管理者限定）：從卡片的「更多處置」選單開啟，理由彈窗選理由後確認。
    await followUpCard.locator('summary').click();
    await followUpCard.locator('[data-appointment-action="delete"]').click();
    const dialog = page.locator('.confirm-dialog');
    await expect(dialog.locator('.confirm-dialog-reason')).toBeVisible();
    await dialog.locator('select').selectOption('wrong_patient');
    await dialog.locator('button.button-danger').click();

    // 刪除後清單不再有任何預約卡。
    await expect(page.locator('[data-appointment-card]')).toHaveCount(0);
  });

  test('櫃台帳號看不到刪除入口', async ({ page }) => {
    // 先以管理者建立一筆，再以櫃台登入檢查刪除入口缺席。
    await loginAsAdmin(page);
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
