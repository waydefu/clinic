import { expect, test, type Route } from '@playwright/test';
import { login, switchRole } from './support/workbench.js';

const FIREBASE_CONFIG = {
  apiKey: 'synthetic-browser-test-key',
  authDomain: 'beauessence-clinic-staging.firebaseapp.com',
  projectId: 'beauessence-clinic-staging',
  appId: '1:000000000:web:synthetic'
};

const MONTHLY_USAGE = {
  policyVersion: 'BD-POLICY-2026-09-29',
  scope: 'internal_synthetic',
  month: '2026-09',
  timeZone: 'Asia/Taipei',
  completeness: 'complete',
  lockedAt: '2026-10-01T00:00:00.000Z',
  uniqueStaffUsers: 3,
  bookingCreatedCount: 18,
  usageClassification: 'used',
  maintenanceFeeTwd: 12000
};

const INITIAL_MILESTONES = {
  policyVersion: 'BD-POLICY-2026-09-29',
  scope: 'internal_synthetic',
  revision: 7,
  trial: {
    status: 'ended',
    startDate: '2026-08-01',
    endExclusiveDate: '2026-09-01'
  },
  formalLaunch: { status: 'awaiting_acknowledgement' },
  formalOperation: { status: 'in_progress', checkpointDate: '2026-10-01' },
  finalPayment: { status: 'awaiting_acknowledgement' },
  maintenance: { status: 'scheduled', startDate: '2026-11-01' }
};

async function enableServerSession(page, role = 'manager') {
  await page.addInitScript((initialRole) => {
    sessionStorage.setItem('calPilotCsrf', 'csrf_synthetic_test');
    sessionStorage.setItem('calPilotRole', initialRole);
    window.addEventListener(
      'beauessence:reauth-request',
      (event) => {
        event.stopImmediatePropagation();
        const { requestId } = event.detail;
        const state = window as Window & { __reauthRequestIds?: string[] };
        state.__reauthRequestIds ??= [];
        state.__reauthRequestIds.push(requestId);
        window.dispatchEvent(
          new CustomEvent('beauessence:reauth-result', {
            detail: { requestId, idToken: 'synthetic-fresh-token' }
          })
        );
      },
      { capture: true }
    );
  }, role);
  await page.route('**/v1/calendar-session/client-config', (route) =>
    route.fulfill({ json: FIREBASE_CONFIG })
  );
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

test.describe('商務與驗收工作區', () => {
  test('loads the deferred panel only after a manager selects its tab', async ({
    page
  }, testInfo) => {
    const chunkRequests: string[] = [];
    page.on('request', (request) => {
      if (
        /\/(?:calendar-pilot-client|modules\/(?:business-reauth|business-view))\.[a-f0-9]+\.js$|\/calendar-pilot(?:\.[a-f0-9]+)?\.css$/.test(
          request.url()
        )
      )
        chunkRequests.push(request.url());
    });
    await enableServerSession(page);
    await page.goto('/staff');
    await expect(page.getByRole('link', { name: '商務與驗收' })).toBeVisible();
    expect(chunkRequests).toEqual([]);

    const reauthChunk = page.waitForRequest((request) =>
      /\/modules\/business-reauth\.[a-f0-9]+\.js$/.test(request.url())
    );
    const authStylesheet = page.waitForRequest((request) =>
      /\/calendar-pilot(?:\.[a-f0-9]+)?\.css$/.test(request.url())
    );
    const clientChunk = page.waitForRequest((request) =>
      /\/calendar-pilot-client\.[a-f0-9]+\.js$/.test(request.url())
    );
    const businessChunk = page.waitForRequest((request) =>
      /\/modules\/business-view\.[a-f0-9]+\.js$/.test(request.url())
    );
    await page.getByRole('link', { name: '商務與驗收' }).click();
    const [reauthRequest, stylesheetRequest, clientRequest, businessRequest] =
      await Promise.all([
        reauthChunk,
        authStylesheet,
        clientChunk,
        businessChunk
      ]);
    const [
      reauthResponse,
      stylesheetResponse,
      clientResponse,
      businessResponse
    ] = await Promise.all([
      reauthRequest.response(),
      stylesheetRequest.response(),
      clientRequest.response(),
      businessRequest.response()
    ]);
    if (
      reauthResponse === null ||
      stylesheetResponse === null ||
      clientResponse === null ||
      businessResponse === null
    )
      throw new Error('A deferred workbench chunk did not respond.');
    await expect(page.locator('#business-section')).toContainText('月用量');
    const reauthBytes = (await reauthResponse.body()).byteLength;
    const stylesheetBytes = (await stylesheetResponse.body()).byteLength;
    const clientBytes = (await clientResponse.body()).byteLength;
    const businessBytes = (await businessResponse.body()).byteLength;
    expect(reauthResponse.ok()).toBe(true);
    expect(stylesheetResponse.ok()).toBe(true);
    expect(clientResponse.ok()).toBe(true);
    expect(businessResponse.ok()).toBe(true);
    expect(chunkRequests).toEqual([
      reauthRequest.url(),
      stylesheetRequest.url(),
      clientRequest.url(),
      businessRequest.url()
    ]);
    expect(reauthBytes).toBeGreaterThan(0);
    expect(stylesheetBytes).toBeGreaterThan(0);
    expect(clientBytes).toBeGreaterThan(0);
    expect(businessBytes).toBeGreaterThan(0);
    testInfo.annotations.push({
      type: 'deferred-business-and-reauth-chunks',
      description: `reauth=${reauthBytes} raw bytes (${reauthRequest.url()}); CSS=${stylesheetBytes} raw bytes (${stylesheetRequest.url()}); client=${clientBytes} raw bytes (${clientRequest.url()}); business=${businessBytes} raw bytes (${businessRequest.url()})`
    });
  });

  test('manager can read reports and acknowledge milestones; front desk is redirected', async ({
    page
  }) => {
    let milestones = { ...INITIAL_MILESTONES };
    const writes = [];
    await enableServerSession(page);
    await page.route('**/v1/business-delivery/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/monthly-usage')) {
        const month = new URL(request.url()).searchParams.get('month');
        return json(route, { ...MONTHLY_USAGE, month });
      }
      if (path.endsWith('/milestones') && request.method() === 'GET')
        return json(route, milestones);
      if (path.endsWith('/pending-deletion'))
        return json(route, { patients: [] });
      if (path.endsWith('/acknowledgements') && request.method() === 'POST') {
        writes.push({
          path,
          body: request.postDataJSON(),
          headers: request.headers()
        });
        milestones = {
          ...milestones,
          revision: milestones.revision + 1,
          finalPayment: {
            status: 'acknowledged',
            acknowledgedDate: '2026-10-01'
          }
        };
        return json(route, {
          milestoneId: 'final_payment',
          revision: milestones.revision,
          replayed: false
        });
      }
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.goto('/staff#business-section');
    await expect(page.locator('#business-section')).toBeVisible();
    await expect(page.locator('#business-section')).toContainText('3');
    await expect(page.locator('#business-section')).toContainText('NT$ 12,000');
    await expect(page.locator('#business-section')).toContainText('試營運');
    await expect(page.locator('#business-section')).toContainText(
      '2026-08-01 至 2026-09-01'
    );

    await page.getByLabel('尾款證據編號').fill('evidence_synthetic_007');
    await page.getByRole('button', { name: '重新登入並確認尾款' }).click();
    await expect(page.locator('#business-section')).toContainText('操作已完成');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/),
      expectedVersion: 7,
      evidenceRef: 'evidence_synthetic_007'
    });
    expect(writes[0]?.headers['x-reauth-id-token']).toBe(
      'synthetic-fresh-token'
    );
    expect(writes[0]?.headers['x-csrf-token']).toBe('csrf_synthetic_test');
    expect(writes[0]?.headers.cookie).toBeUndefined();
    expect(
      await page.evaluate(() =>
        Object.values(sessionStorage).some((value) =>
          value.includes('synthetic-fresh-token')
        )
      )
    ).toBe(false);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __reauthRequestIds?: string[] })
            .__reauthRequestIds
      )
    ).toHaveLength(1);
  });

  test('synthetic manager sees the closed mode message and sends no business request', async ({
    page
  }) => {
    const businessRequests = [];
    await page.route('**/v1/business-delivery/**', (route) => {
      businessRequests.push(route.request().url());
      return json(route, {});
    });
    await login(page, 'admin');
    await page.goto('/staff#business-section');
    await expect(page.locator('#business-section')).toContainText(
      '此功能只在 C1 伺服器模式可用'
    );
    await expect(page.locator('#business-content')).toBeHidden();
    expect(businessRequests).toEqual([]);
    await switchRole(page, 'front');
    await expect(page.locator('#business-section')).toHaveCount(0);
    await page.goto('/staff#business-section');
    await expect(page).toHaveURL(/#overview$/);
  });

  test('creates, checks, downloads, and revokes an audited CSV export', async ({
    page
  }) => {
    await enableServerSession(page);
    let job = {
      exportId: 'export_synthetic_001',
      status: 'ready',
      format: 'csv',
      from: '2026-09-01',
      to: '2026-09-30',
      rowCount: 2,
      byteLength: 100,
      sha256: 'a'.repeat(64),
      createdAt: '2026-10-01T00:00:00.000Z',
      downloadExpiresAt: '2026-10-02T00:00:00.000Z',
      downloadsRemaining: 3,
      purgeAt: '2026-10-03T00:00:00.000Z'
    };
    const writes = [];
    await page.route('**/v1/business-delivery/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/monthly-usage')) return json(route, MONTHLY_USAGE);
      if (path.endsWith('/milestones')) return json(route, INITIAL_MILESTONES);
      if (path.endsWith('/pending-deletion'))
        return json(route, { patients: [] });
      if (
        path === '/v1/business-delivery/exports' &&
        request.method() === 'POST'
      ) {
        writes.push({
          kind: 'create',
          body: request.postDataJSON(),
          headers: request.headers()
        });
        return json(route, job);
      }
      if (path.endsWith('/download')) {
        job = { ...job, downloadsRemaining: job.downloadsRemaining - 1 };
        return route.fulfill({
          status: 200,
          contentType: 'text/csv; charset=utf-8',
          headers: {
            'Content-Disposition':
              'attachment; filename="export-2026-09-01-2026-09-30.csv"'
          },
          body: 'opaque_id,created_at\nbooking_test_001,2026-09-01T00:00:00.000Z\n'
        });
      }
      if (path.endsWith('/revoke') && request.method() === 'POST') {
        writes.push({
          kind: 'revoke',
          body: request.postDataJSON(),
          headers: request.headers()
        });
        job = { ...job, status: 'revoked', downloadsRemaining: 0 };
        return json(route, job);
      }
      if (path.endsWith('/export_synthetic_001')) return json(route, job);
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.goto('/staff#business-section');
    await page.getByLabel('起始日期（台北）').fill('2026-09-01');
    await page.getByLabel('結束日期（台北）').fill('2026-09-30');
    await page.getByRole('button', { name: '重新登入並建立匯出' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '匯出工作已建立'
    );
    await expect(page.locator('#business-section')).toContainText(
      '剩餘 3 次下載'
    );
    expect(writes[0]?.body).toEqual({
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/),
      format: 'csv',
      from: '2026-09-01',
      to: '2026-09-30'
    });
    expect(writes[0]?.headers['x-reauth-id-token']).toBe(
      'synthetic-fresh-token'
    );
    expect(writes[0]?.headers['x-csrf-token']).toBe('csrf_synthetic_test');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '下載 CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      'export-2026-09-01-2026-09-30.csv'
    );
    await page.getByRole('button', { name: '查詢狀態' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '剩餘 2 次下載'
    );
    await page.getByRole('button', { name: '撤銷匯出' }).click();
    await expect(page.locator('#business-section')).toContainText('已撤銷');
    expect(writes).toHaveLength(2);
    expect(writes[1]?.headers['x-csrf-token']).toBe('csrf_synthetic_test');
  });

  test('handles archive conflict, restore, legal hold, and permanent deletion', async ({
    page
  }) => {
    await enableServerSession(page);
    let legalHold = false;
    const writes = [];
    await page.route('**/v1/business-delivery/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/monthly-usage')) return json(route, MONTHLY_USAGE);
      if (path.endsWith('/milestones')) return json(route, INITIAL_MILESTONES);
      if (path.endsWith('/pending-deletion'))
        return json(route, {
          patients: [
            {
              patientId: 'patient_test_archived_001',
              archivedAt: '2026-09-01T00:00:00.000Z',
              restorableUntil: '2026-10-01T00:00:00.000Z',
              legalHold
            }
          ]
        });
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        writes.push({ path, body, headers: request.headers() });
        if (
          path.endsWith('/archive') &&
          body.patientId === 'patient_test_conflict_001'
        )
          return json(
            route,
            { error: { message: '有未來的有效預約，請先取消。' } },
            409
          );
        if (path.endsWith('/archive'))
          return json(route, {
            patientId: body.patientId,
            state: 'archived',
            restorableUntil: '2026-10-31T00:00:00.000Z'
          });
        if (path.endsWith('/restore'))
          return json(route, { patientId: body.patientId, state: 'active' });
        if (path.endsWith('/legal-hold')) {
          legalHold = body.hold;
          return json(route, { patientId: body.patientId, legalHold });
        }
        if (path.endsWith('/permanent-delete')) {
          if (legalHold)
            return json(
              route,
              { error: { message: 'legal hold 生效中，不能永久刪除。' } },
              409
            );
          return json(route, {
            patientId: body.patientId,
            state: 'deleted',
            layers: {
              patients: 1,
              appointments: 0,
              patient_booking_guards: 0,
              patient_follow_up_states: 0,
              return_sessions: 0,
              follow_ups: 0,
              patient_lookup_index_v2: 1
            }
          });
        }
      }
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.goto('/staff#business-section');
    await expect(page.locator('#business-section')).toContainText(
      'patient_test_archived_001'
    );
    await expect(page.locator('#business-section')).not.toContainText('王小明');
    await page
      .getByLabel('患者不透明識別碼')
      .first()
      .fill('patient_test_conflict_001');
    await page.getByRole('button', { name: '重新登入並封存' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '有未來的有效預約'
    );

    await page
      .getByLabel('患者不透明識別碼')
      .first()
      .fill('patient_test_archive_001');
    await page.getByRole('button', { name: '重新登入並封存' }).click();
    await expect(page.locator('#business-section')).toContainText('可復原至');
    await page
      .getByLabel('患者不透明識別碼')
      .nth(1)
      .fill('patient_test_archive_001');
    await page.getByRole('button', { name: '復原封存患者' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '封存資料已復原'
    );

    await page
      .getByLabel('患者不透明識別碼')
      .nth(2)
      .fill('patient_test_archived_001');
    await page.getByLabel('legal hold').selectOption('true');
    await page.getByRole('button', { name: '更新 legal hold' }).click();
    await expect(page.locator('#business-section')).toContainText(
      'legal hold 已設定'
    );
    await page
      .getByLabel('患者不透明識別碼')
      .nth(3)
      .fill('patient_test_archived_001');
    await page.getByLabel('我確認永久刪除此患者資料').check();
    await page.getByRole('button', { name: '重新登入並永久刪除' }).click();
    await expect(page.locator('#business-section')).toContainText(
      'legal hold 生效中'
    );
    await page.getByLabel('legal hold').selectOption('false');
    await page.getByRole('button', { name: '更新 legal hold' }).click();
    await page.getByLabel('我確認永久刪除此患者資料').check();
    await page.getByRole('button', { name: '重新登入並永久刪除' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '永久刪除已完成'
    );

    const protectedWrites = writes.filter(
      (write) =>
        write.path.endsWith('/archive') ||
        write.path.endsWith('/permanent-delete')
    );
    expect(protectedWrites.length).toBe(4);
    for (const write of protectedWrites) {
      expect(write.headers['x-reauth-id-token']).toBe('synthetic-fresh-token');
      expect(write.headers['x-csrf-token']).toBe('csrf_synthetic_test');
    }
  });

  test('records attributed termination receipts and sends close to manual review', async ({
    page
  }) => {
    await enableServerSession(page);
    let retentionElapsed = false;
    let record = {
      terminationId: 'termination_synthetic_001',
      state: 'termination_pending',
      noticeDate: '2026-10-01',
      noticeStartedAt: '2026-10-01T00:00:00.000Z',
      noticeDueAt: '2026-10-08T00:00:00.000Z',
      controlledRetentionUntil: '2026-11-08T00:00:00.000Z',
      version: 1,
      receipts: [],
      closeReadiness: {
        ready: false,
        missingSteps: [
          'data_return',
          'controlled_copy_retention',
          'backup_disposition',
          'audit_disposition',
          'access_revocation'
        ]
      }
    };
    const writes: Array<{
      path: string;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    }> = [];
    await page.route('**/v1/business-delivery/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/monthly-usage')) return json(route, MONTHLY_USAGE);
      if (path.endsWith('/milestones')) return json(route, INITIAL_MILESTONES);
      if (path.endsWith('/pending-deletion'))
        return json(route, { patients: [] });
      if (
        path === '/v1/business-delivery/terminations' &&
        request.method() === 'POST'
      ) {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ path, body, headers: request.headers() });
        return json(route, record);
      }
      if (path.endsWith('/acknowledgements') && request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ path, body, headers: request.headers() });
        const receipt = {
          receiptKind: body.receiptKind,
          ...(body.exportId === undefined
            ? { evidenceRef: body.evidenceRef }
            : { exportId: body.exportId, sha256: 'b'.repeat(64) }),
          actorRef: 'actor_synthetic_001',
          acknowledgedAt: '2026-10-01T01:00:00.000Z'
        };
        record = {
          ...record,
          version: record.version + 1,
          receipts: [...record.receipts, receipt],
          closeReadiness: {
            ready: retentionElapsed && record.receipts.length >= 3,
            missingSteps: retentionElapsed
              ? []
              : [
                  'controlled_copy_retention',
                  'backup_disposition',
                  'audit_disposition',
                  'access_revocation'
                ]
          }
        };
        return json(route, { ...record, receipt });
      }
      if (path.endsWith('/close') && request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ path, body, headers: request.headers() });
        if (!record.closeReadiness.ready)
          return json(
            route,
            {
              error: {
                message:
                  '仍缺少資料返還、受控副本保存、備份處置、稽核紀錄處置與帳號權限撤銷。'
              }
            },
            409
          );
        record = {
          ...record,
          state: 'manual_close_review',
          version: record.version + 1
        };
        return json(route, record);
      }
      if (path.includes('/terminations/') && request.method() === 'GET') {
        if (retentionElapsed)
          record = {
            ...record,
            closeReadiness: { ready: true, missingSteps: [] }
          };
        return json(route, record);
      }
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.goto('/staff#business-section');
    const noticeDate = await page.getByLabel('通知日期（台北）').inputValue();
    await page.getByRole('button', { name: '重新登入並開啟終止通知' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '合作終止通知進行中'
    );
    expect(writes[0]?.body).toEqual({
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/),
      noticeDate
    });
    expect(writes[0]?.headers['x-reauth-id-token']).toBe(
      'synthetic-fresh-token'
    );
    expect(writes[0]?.headers['x-csrf-token']).toBe('csrf_synthetic_test');

    await page.getByLabel('合作個案識別碼').fill('termination_synthetic_001');
    await page.getByRole('button', { name: '載入合作個案' }).click();
    await expect(page.locator('#business-section')).toContainText('操作者');
    await page.getByRole('button', { name: '重新登入並送交結案審查' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '409：仍缺少'
    );

    // The fixture advances the server's controlled-copy retention clock after
    // proving that a premature close is denied.
    retentionElapsed = true;
    await page.getByLabel('確認項目').selectOption('data_return');
    await page.getByLabel('已簽收匯出識別碼').fill('export_synthetic_001');
    await page.getByRole('button', { name: '重新登入並記錄確認' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '操作者 actor_synthetic_001'
    );
    for (const [kind, evidence] of [
      ['backup_disposition', 'backup_evidence_001'],
      ['audit_disposition', 'audit_evidence_001'],
      ['access_revocation', 'access_evidence_001']
    ]) {
      await page.getByLabel('確認項目').selectOption(kind);
      await page.getByLabel('人工核對證據編號').fill(evidence);
      await page.getByRole('button', { name: '重新登入並記錄確認' }).click();
    }
    await page.getByRole('button', { name: '重新登入並送交結案審查' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '已提交人工結案審查；服務仍待人員確認，系統沒有停用服務或刪除資料。'
    );

    const posted = writes.slice(1);
    for (const write of posted) {
      expect(write.headers['x-reauth-id-token']).toBe('synthetic-fresh-token');
      expect(write.headers['x-csrf-token']).toBe('csrf_synthetic_test');
      expect(write.body).not.toHaveProperty('actorRef');
      expect(write.body).not.toHaveProperty('acknowledgedAt');
      expect(write.body).not.toHaveProperty('sha256');
      expect(write.body).not.toHaveProperty('complete');
    }
    expect(posted.at(-1)?.body).toEqual({
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/),
      expectedVersion: record.version - 1
    });
  });
});
