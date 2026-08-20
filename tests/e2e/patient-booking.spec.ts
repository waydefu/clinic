import { expect, test } from '@playwright/test';

import { fillBirthDate, submitBooking } from './support/patient';
import { STORAGE_KEY, login } from './support/workbench';

/** 讀出瀏覽器裡的合成狀態。斷言「送出去的東西真的存下來了」時用。 */
async function syntheticState(page: import('@playwright/test').Page) {
  return JSON.parse(
    await page.evaluate(
      (key) => window.localStorage.getItem(key) ?? 'null',
      STORAGE_KEY
    )
  );
}

// 患者端完整預約流程，跑在打包後的最終產物上。這是唯一一條真正走完四步驟精靈
// 的路徑，證明合成建立預約在真瀏覽器裡從頭到尾可用，而不只是單元層的函式。

test.describe('患者線上預約', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking');
    // 每個測試各自的 context 已是乾淨的 localStorage；仍明確清一次並重載，
    // 讓合成資料回到出廠狀態，測試互不影響。
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('走完四步驟並建立一筆初診預約', async ({ page }) => {
    // 步驟 1：選初診，再選第一個看診項目（選項目會前進到步驟 2）。
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();

    // 步驟 2：選第一個可預約時段（選時段會前進到步驟 3）。
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    await page.locator('[data-patient-slot]').first().click();

    // 步驟 3：填基本資料，並勾選兩個各自獨立的確認——測試用的告知草稿已讀，
    // 以及「資料只留在本機」。前者不會建立正式同意紀錄。
    await page.locator('#patient-name').fill('測試患者甲');
    await page.locator('#patient-phone').fill('0912345678');
    await fillBirthDate(page, { year: '1990', month: '05', day: '20' });
    await page.locator('#patient-national-id').fill('A123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await page.locator('#confirm-patient-booking').click();
    // 不驗「送出中…」那個瞬間狀態：斷言是點擊之後才開始輪詢，本機動作往往在
    // 輪詢開始前就結束了，於是變成間歇性紅燈。忙碌狀態的專屬測試在
    // workbench-lifecycle.spec.ts，用 MutationObserver 確定性地觀察。

    // 步驟 4：完成畫面出現預約編號。
    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已建立'
    );
    await expect(page.locator('#booking-result')).toContainText('預約編號');
    await expect(page.locator('#booking-result')).toContainText('appointment_');
  });

  test('固定顯示合成資料邊界，鍵盤可完成預約與取消且不發出後端請求', async ({
    page
  }) => {
    const requests: Array<{ method: string; url: string }> = [];
    page.on('request', (request) => {
      requests.push({ method: request.method(), url: request.url() });
    });
    await page.reload();

    const headerBoundary = page.locator('.patient-header .environment-badge');
    await expect(headerBoundary).toBeVisible();
    await expect(headerBoundary).toContainText('勿填真實患者資料');
    const footerBoundary = page.locator('#patient-env-boundary');
    await expect(footerBoundary).toBeVisible();
    await expect(footerBoundary).toContainText('勿填真實患者或健康資料');
    await expect(footerBoundary).toContainText('只存本機瀏覽器');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow'
    );

    const approvedFields = await page
      .locator(
        '#patient-booking-form input[id], #patient-booking-form textarea[id]'
      )
      .evaluateAll((fields) => fields.map((field) => field.id).sort());
    expect(approvedFields).toEqual(
      [
        'patient-birth-day',
        'patient-birth-month',
        'patient-birth-year',
        'patient-name',
        'patient-national-id',
        'patient-nhi-card',
        'patient-note',
        'patient-passport',
        'patient-phone',
        'patient-referrer',
        'privacy-consent',
        'synthetic-confirmation'
      ].sort()
    );

    const origin = new URL(page.url()).origin;
    expect(
      requests.filter((request) => new URL(request.url).origin !== origin)
    ).toEqual([]);
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
    requests.length = 0;

    await page.locator('[data-booking-type="initial"]').press('Enter');
    await page
      .locator('#patient-services [data-service]')
      .first()
      .press('Enter');
    await expect(page.locator('[data-booking-step="2"]')).toBeVisible();
    await page.locator('[data-patient-slot]').first().press('Enter');
    await expect(page.locator('[data-booking-step="3"]')).toBeVisible();
    await page.locator('#patient-name').fill('鍵盤合成患者');
    await page.locator('#patient-phone').fill('0900111222');
    await fillBirthDate(page, { year: '1991', month: '04', day: '18' });
    await page.locator('#patient-national-id').fill('G123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已建立'
    );
    const persisted = await syntheticState(page);
    expect(persisted.appointments.at(-1)).toMatchObject({
      status: 'confirmed',
      bookingKind: 'initial'
    });

    await page.locator('[data-patient-cancel]').first().click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '取消要求已送出'
    );
    expect((await syntheticState(page)).appointments.at(-1).status).toBe(
      'cancellation_requested'
    );
    expect(requests, '建立與取消只能使用瀏覽器內的 synthetic store').toEqual(
      []
    );
  });

  test('同一時段的第二筆預約在寫入前被拒絕', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('時段衝突患者甲');
    await page.locator('#patient-phone').fill('0900222333');
    await fillBirthDate(page, { year: '1986', month: '09', day: '07' });
    await page.locator('#patient-national-id').fill('H123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    const result = await page.evaluate(async (key) => {
      const storeUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/store\.[a-f0-9]+\.js$/.test(name));
      if (storeUrl === undefined)
        throw new Error('找不到打包後的 synthetic store module。');
      const { stagingRequest } = await import(storeUrl);
      const before = await stagingRequest('/state');
      const appointment = before.appointments.at(-1);
      const persistedBefore = window.localStorage.getItem(key);
      let message = '';
      try {
        await stagingRequest('/bookings', {
          method: 'POST',
          body: JSON.stringify({
            slotId: appointment.slotId,
            bookingKind: appointment.bookingKind,
            itemIds: appointment.itemIds,
            origin: 'patient',
            patient: {
              name: '時段衝突患者乙',
              phone: '0900333444',
              birthDate: '1987-10-08',
              nationalId: 'I123456789',
              hasNhiCard: false
            }
          })
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      const after = await stagingRequest('/state');
      const slot = after.slots.find((item) => item.id === appointment.slotId);
      return {
        message,
        persistedUnchanged:
          window.localStorage.getItem(key) === persistedBefore,
        beforeCounts: {
          appointments: before.appointments.length,
          patients: before.patients.length,
          auditEvents: before.auditEvents.length,
          outboxJobs: before.outboxJobs.length
        },
        afterCounts: {
          appointments: after.appointments.length,
          patients: after.patients.length,
          auditEvents: after.auditEvents.length,
          outboxJobs: after.outboxJobs.length
        },
        reservationId: slot?.reservationId,
        appointmentId: appointment.id
      };
    }, STORAGE_KEY);

    expect(result.message).toContain('此時段已無法預約');
    expect(result.persistedUnchanged).toBe(true);
    expect(result.afterCounts).toEqual(result.beforeCounts);
    expect(result.reservationId).toBe(result.appointmentId);
  });

  // P12（業主 2026-07-27）：加入行事曆是患者唯一會拿到的提醒，所以完成畫面要
  // 明講「沒加就不會再有提醒」。但**提出取消之後那句話必須消失**——已經沒有門診
  // 可以提醒了，留著會讓同一個畫面同時說「取消要求已送出」與「記得加入行事曆」。
  // 取消路徑改寫的是同一批 id，所以這一段特別容易在改版時被漏掉。
  test('完成畫面說明沒有其他提醒管道，提出取消後收起那句話', async ({
    page
  }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者丙');
    await page.locator('#patient-phone').fill('0933444555');
    await fillBirthDate(page, { year: '1978', month: '03', day: '09' });
    await page.locator('#patient-national-id').fill('C123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    await expect(page.locator('#booking-complete-reminder')).toBeVisible();
    await expect(page.locator('#booking-complete-reminder')).toContainText(
      '不會再發出任何提醒'
    );

    await page.locator('[data-patient-cancel]').first().click();
    await page.locator('.confirm-dialog button.button-primary').click();

    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '取消要求已送出'
    );
    await expect(page.locator('#booking-complete-reminder')).toBeHidden();
  });

  // P1b：回診狀態自 2026-07-27 起顯示在按鈕**外**。留在按鈕裡的話，這段會變的
  // 文字會成為按鈕可及名稱的一部分，等於每次狀態更新都在改「這顆按鈕叫什麼」。
  test('回診狀態顯示在掛號別按鈕之外', async ({ page }) => {
    const status = page.locator('#follow-up-choice-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('回診狀態');
    expect(
      await status.evaluate(
        (element) => element.closest('[data-booking-type]') !== null
      ),
      '#follow-up-choice-status 又被放回掛號別按鈕裡了'
    ).toBe(false);
    // 但按鈕仍必須指得到它，否則報讀器聽不到「為什麼現在不能選回診」。
    await expect(
      page.locator('[data-booking-type="follow_up"]')
    ).toHaveAttribute('aria-describedby', 'follow-up-choice-status');
  });

  test('未勾選本機保存確認時擋下送出並說明原因', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者乙');
    await page.locator('#patient-phone').fill('0922333444');
    await fillBirthDate(page, { year: '1985', month: '11', day: '02' });
    await page.locator('#patient-national-id').fill('B287654321');
    // 告知草稿已讀要先勾起來，才驗得到「本機保存確認」這一條——兩個確認各自
    // 報錯，而已讀 gate 排在前面。只留一個沒勾，才知道報的是不是對的那一句。
    await page.locator('#privacy-consent').check();
    // 故意不勾 synthetic-confirmation。
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#synthetic-confirmation-error')).toBeVisible();
    // 沒有前進到完成步驟——步驟 4 面板維持隱藏（其標題文字是靜態預設，不能
    // 拿它判斷是否完成）。
    await expect(page.locator('[data-booking-step="4"]')).toBeHidden();
  });

  // P7／P9（業主 2026-07-27）：患者自述的備註、需求標籤與訊息來源。
  test('備註、需求與來源標籤會跟著預約一起存下來', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者丁');
    await page.locator('#patient-phone').fill('0955666777');
    await fillBirthDate(page, { year: '1992', month: '08', day: '14' });
    await page.locator('#patient-national-id').fill('D123456789');

    await page.locator('[data-request-tag="same_day_procedure"]').check();
    await page.locator('[data-source-tag="friend_referral"]').check();
    await expect(page.locator('#patient-referrer-field')).toBeVisible();
    await page.locator('#patient-referrer').fill('王小明');
    await page.locator('#patient-note').fill('曾經做過鼻中膈手術。');

    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    const state = await syntheticState(page);
    const appointment = state.appointments.at(-1);
    expect(appointment.requestTags).toEqual(['same_day_procedure']);
    expect(appointment.sourceTags).toEqual(['friend_referral']);
    expect(appointment.referrerName).toBe('王小明');
    // 患者自述與櫃台的營運備註是**兩個欄位**：合成一個的話，櫃台一按「修改備註」
    // 就會把患者寫的話覆蓋掉，而且沒有任何痕跡。
    expect(appointment.patientNote).toBe('曾經做過鼻中膈手術。');
    expect(appointment.noteText).toBe('');
  });

  // 介紹人是**第三人**的姓名，那個人不在現場也沒有被告知。取消勾選之後欄位收起
  // 來，但值如果留在 DOM 裡仍會被一起送出——畫面上看不到的資料照樣離開了表單。
  test('取消勾選介紹管道時，介紹人姓名不會偷偷跟著送出', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者戊');
    await page.locator('#patient-phone').fill('0966777888');
    await fillBirthDate(page, { year: '1988', month: '01', day: '30' });
    await page.locator('#patient-national-id').fill('E123456789');

    await page.locator('[data-source-tag="staff_referral"]').check();
    await page.locator('#patient-referrer').fill('不該被送出的名字');
    await page.locator('[data-source-tag="staff_referral"]').uncheck();
    await expect(page.locator('#patient-referrer-field')).toBeHidden();
    await expect(page.locator('#patient-referrer')).toHaveValue('');

    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    const state = await syntheticState(page);
    const appointment = state.appointments.at(-1);
    expect(appointment.referrerName).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('不該被送出的名字');
  });
});

// P10／P11（業主 2026-07-27）：生日年份選填，外籍患者改填護照。
test.describe('身分欄位', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
  });

  test('不填年份也能預約，存下來的是省略年份的形式', async ({ page }) => {
    await page.locator('#patient-name').fill('無年份');
    await page.locator('#patient-phone').fill('0911222333');
    await fillBirthDate(page, { month: '5', day: '20' });
    await page.locator('#patient-national-id').fill('G123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    const state = await syntheticState(page);
    // `--MM-DD` 是 XSD gMonthDay：一眼看得出年份是刻意沒有的，而不是被截斷。
    // 個位數的月與日由介面補零，不是丟給 domain 處理。
    expect(state.patients.at(-1).birthDate).toBe('--05-20');
  });

  test('勾選外籍人士就改問護照，身分證欄連值一起收起來', async ({ page }) => {
    await page.locator('#patient-national-id').fill('H123456789');
    await page.locator('[data-request-tag="foreign_national"]').check();

    await expect(page.locator('#patient-national-id-field')).toBeHidden();
    await expect(page.locator('#patient-passport-field')).toBeVisible();
    // 收起來但還留著值的欄位照樣會被送出去——那是身分識別資料。
    await expect(page.locator('#patient-national-id')).toHaveValue('');

    await page.locator('#patient-name').fill('外籍患者');
    await page.locator('#patient-phone').fill('0922111000');
    await fillBirthDate(page, { year: '1985', month: '11', day: '02' });
    await page.locator('#patient-passport').fill('AB1234567');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    const patient = (await syntheticState(page)).patients.at(-1);
    expect(patient.passportNumber).toBe('AB1234567');
    expect(patient.nationalId).toBe('');
  });

  test('兩種證件都沒填時，錯誤要同時指出兩條路', async ({ page }) => {
    await page.locator('#patient-name').fill('缺證件');
    await page.locator('#patient-phone').fill('0933000111');
    await fillBirthDate(page, { year: '1990', month: '05', day: '20' });
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await page.locator('#confirm-patient-booking').click();

    const error = page.locator('#patient-national-id-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('外籍人士');
    await expect(page.locator('[data-booking-step="4"]')).toBeHidden();
  });
});

// P2（業主 2026-07-27）：醫師已登錄回診指示後，這位患者這一次要走的是回診，
// 初診鍵停用並說明原因。走的是真的路徑——患者自己約一次、櫃台標到診並登錄回診
// ——而不是捏造一筆 followUps 進去，否則測到的只是自己寫的假資料形狀。
test.describe('已確認回診時的掛號別', () => {
  test('初診鍵停用，並在按鈕外說明為什麼', async ({ page }) => {
    await page.goto('/booking');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('回診測試');
    await page.locator('#patient-phone').fill('0977888999');
    await fillBirthDate(page, { year: '1975', month: '06', day: '11' });
    await page.locator('#patient-national-id').fill('F123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await submitBooking(page);

    // 櫃台端：標成到診，再登錄「需要回診」。用的是工作臺實際會走的兩條路徑，
    // 權限也照常檢查——所以必須先登入（保留剛才那筆合成狀態）。
    await login(page, 'admin', { fresh: false });
    const recorded = await page.evaluate(async () => {
      const storeUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/store\.[a-f0-9]+\.js$/.test(name));
      if (storeUrl === undefined)
        throw new Error('找不到打包後的 synthetic store module。');
      const { stagingRequest } = await import(storeUrl);
      const state = await stagingRequest('/state');
      const appointment = state.appointments.at(-1);
      await stagingRequest(`/bookings/${appointment.id}/complete`, {
        method: 'POST',
        body: '{}'
      });
      // 回診網格只開每小時 :15 與 :45，所以目標時間直接取一個真的空回診時段，
      // 而不是自己湊一個時間字串。
      const slot = state.slots.find(
        (item) => item.kind === 'follow_up' && item.reservationId === undefined
      );
      const taipei = new Date(
        new Date(slot.startsAt).getTime() + 8 * 60 * 60 * 1000
      ).toISOString();
      await stagingRequest(`/follow-ups/${appointment.id}`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'required',
          dueDate: taipei.slice(0, 10),
          dueTime: taipei.slice(11, 16)
        })
      });
      return taipei.slice(0, 10);
    });
    expect(recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.goto('/booking');
    await expect(page.locator('[data-booking-type="follow_up"]')).toBeEnabled();
    await expect(page.locator('[data-booking-type="initial"]')).toBeDisabled();
    // 停用的按鈕不會自己說明原因，說明在兩顆按鈕共用的那一行上，而兩顆都以
    // aria-describedby 指向它。
    await expect(page.locator('#follow-up-choice-status')).toContainText(
      '初診暫不開放'
    );
    // 停用之後選取狀態也要跟著換掉，否則畫面停在一個按不到的選擇上。
    await expect(
      page.locator('[data-booking-type="follow_up"]')
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
