import { expect, test, type Route } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { CANDIDATE_ROLE_PERMISSIONS } from '../../apps/api/src/platform/authorization/rbac.js';
import { ROLES } from '../../packages/domain/src/roles.js';
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

const BUSINESS_EXPORT_ROLE = ROLES.find((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('export_business_data')
);

if (BUSINESS_EXPORT_ROLE === undefined)
  throw new Error('No candidate role is authorized for business data export.');

const DEFERRED_CHUNKS_GZIP_CEILING_BYTES = 68 * 1024;

type BusinessListenerSnapshot = Record<
  'beauessence:workbench-access-change' | 'hashchange' | 'pagehide',
  number
>;

type BusinessListenerTrackerWindow = Window & {
  __businessListenerTracker?: { snapshot: () => BusinessListenerSnapshot };
};

async function enableServerSession(page, role = BUSINESS_EXPORT_ROLE) {
  await page.addInitScript((initialRole) => {
    sessionStorage.setItem('calPilotCsrf', 'csrf_synthetic_test');
    sessionStorage.setItem('calPilotRole', initialRole);
    window.addEventListener(
      'beauessence:reauth-request',
      (event) => {
        event.stopImmediatePropagation();
        const { requestId } = (event as CustomEvent<{ requestId: string }>)
          .detail;
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
  // The workbench trusts only the server's /me answer, never the storage hint.
  // Like the API, the synthetic session answers only for its own CSRF header.
  await page.route('**/v1/calendar-session/me', (route) =>
    route.request().headers()['x-csrf-token'] === 'csrf_synthetic_test'
      ? route.fulfill({
          json: { actorId: 'opaque_business_staff', actorRole: role }
        })
      : route.fulfill({ status: 401, json: {} })
  );
}

async function trackBusinessViewListeners(page) {
  await page.addInitScript(() => {
    const eventTypes = [
      'beauessence:workbench-access-change',
      'hashchange',
      'pagehide'
    ] as const;
    type TrackedEvent = (typeof eventTypes)[number];
    type Snapshot = Record<TrackedEvent, number>;
    const counts: Snapshot = {
      'beauessence:workbench-access-change': 0,
      hashchange: 0,
      pagehide: 0
    };
    const registrations = new WeakMap<object, Set<string>>();
    // Preserve the native methods for delegation from our instrumentation.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalAdd = EventTarget.prototype.addEventListener;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalRemove = EventTarget.prototype.removeEventListener;
    const captureOf = (options?: boolean | AddEventListenerOptions) =>
      typeof options === 'boolean' ? options : options?.capture === true;
    const registrationKey = (type: string, capture: boolean) =>
      `${type}:${capture ? 'capture' : 'bubble'}`;
    const record = (
      listener: EventListenerOrEventListenerObject | null,
      type: string,
      capture: boolean,
      add: boolean
    ) => {
      if (
        listener === null ||
        (typeof listener !== 'function' && typeof listener !== 'object') ||
        !eventTypes.includes(type as TrackedEvent)
      )
        return;
      let active = registrations.get(listener);
      if (active === undefined) {
        active = new Set();
        registrations.set(listener, active);
      }
      const key = registrationKey(type, capture);
      if (add && !active.has(key)) {
        active.add(key);
        counts[type as TrackedEvent] += 1;
      } else if (!add && active.delete(key)) {
        counts[type as TrackedEvent] -= 1;
      }
    };
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options
    ) {
      if (this === window) record(listener, type, captureOf(options), true);
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      listener,
      options
    ) {
      if (this === window) record(listener, type, captureOf(options), false);
      return originalRemove.call(this, type, listener, options);
    };
    Object.defineProperty(window, '__businessListenerTracker', {
      configurable: true,
      value: { snapshot: () => ({ ...counts }) }
    });
  });
}

function businessListenerSnapshot(page) {
  return page.evaluate(() =>
    (
      window as BusinessListenerTrackerWindow
    ).__businessListenerTracker?.snapshot()
  );
}

async function openBusinessViewWithListenerBaseline(page) {
  await page.goto('/staff');
  await expect(page.getByRole('link', { name: '商務與驗收' })).toBeVisible();
  const baseline = await businessListenerSnapshot(page);
  if (baseline === undefined)
    throw new Error('Business view listener instrumentation is unavailable.');
  await page.getByRole('link', { name: '商務與驗收' }).click();
  await expect(page.locator('#business-section')).toContainText('月用量');
  const mounted = await businessListenerSnapshot(page);
  if (mounted === undefined)
    throw new Error('Business view listener instrumentation is unavailable.');
  expect(
    mounted['beauessence:workbench-access-change'] -
      baseline['beauessence:workbench-access-change']
  ).toBe(2);
  expect(mounted.hashchange - baseline.hashchange).toBe(1);
  expect(mounted.pagehide - baseline.pagehide).toBe(1);
  return { baseline, mounted };
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
    const identityReads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/v1/calendar-session/me')
        identityReads.push(request.url());
    });
    await enableServerSession(page);
    // A cached CSRF is only a hint: in server mode the CAL-PILOT client and its
    // stylesheet load at boot and verify it with /me before the workbench opens.
    // The business view and its reauthentication chunk stay deferred.
    const authStylesheet = page.waitForRequest((request) =>
      /\/calendar-pilot(?:\.[a-f0-9]+)?\.css$/.test(request.url())
    );
    const clientChunk = page.waitForRequest((request) =>
      /\/calendar-pilot-client\.[a-f0-9]+\.js$/.test(request.url())
    );
    await page.goto('/staff');
    await expect(page.getByRole('link', { name: '商務與驗收' })).toBeVisible();
    const [stylesheetRequest, clientRequest] = await Promise.all([
      authStylesheet,
      clientChunk
    ]);
    expect(identityReads.length).toBeGreaterThan(0);
    expect(chunkRequests).toEqual([
      stylesheetRequest.url(),
      clientRequest.url()
    ]);

    const reauthChunk = page.waitForRequest((request) =>
      /\/modules\/business-reauth\.[a-f0-9]+\.js$/.test(request.url())
    );
    const businessChunk = page.waitForRequest((request) =>
      /\/modules\/business-view\.[a-f0-9]+\.js$/.test(request.url())
    );
    await page.getByRole('link', { name: '商務與驗收' }).click();
    const [reauthRequest, businessRequest] = await Promise.all([
      reauthChunk,
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
    const [reauthBody, stylesheetBody, clientBody, businessBody] =
      await Promise.all([
        reauthResponse.body(),
        stylesheetResponse.body(),
        clientResponse.body(),
        businessResponse.body()
      ]);
    const reauthBytes = reauthBody.byteLength;
    const stylesheetBytes = stylesheetBody.byteLength;
    const clientBytes = clientBody.byteLength;
    const businessBytes = businessBody.byteLength;
    const deferredGzipBytes = [
      reauthBody,
      stylesheetBody,
      clientBody,
      businessBody
    ].reduce((total, body) => total + gzipSync(body).byteLength, 0);
    expect(reauthResponse.ok()).toBe(true);
    expect(stylesheetResponse.ok()).toBe(true);
    expect(clientResponse.ok()).toBe(true);
    expect(businessResponse.ok()).toBe(true);
    // Selecting the tab adds only the deferred chunks; the auth client and
    // stylesheet from boot are not requested a second time.
    expect(chunkRequests).toEqual([
      stylesheetRequest.url(),
      clientRequest.url(),
      reauthRequest.url(),
      businessRequest.url()
    ]);
    expect(reauthBytes).toBeGreaterThan(0);
    expect(stylesheetBytes).toBeGreaterThan(0);
    expect(clientBytes).toBeGreaterThan(0);
    expect(businessBytes).toBeGreaterThan(0);
    expect(deferredGzipBytes).toBeLessThanOrEqual(
      DEFERRED_CHUNKS_GZIP_CEILING_BYTES
    );
    testInfo.annotations.push({
      type: 'deferred-business-and-reauth-chunks',
      description: `aggregate gzip of boot auth client/CSS and deferred business/reauth=${deferredGzipBytes} bytes (ceiling ${DEFERRED_CHUNKS_GZIP_CEILING_BYTES}); reauth=${reauthBytes} raw bytes (${reauthRequest.url()}); CSS=${stylesheetBytes} raw bytes (${stylesheetRequest.url()}); client=${clientBytes} raw bytes (${clientRequest.url()}); business=${businessBytes} raw bytes (${businessRequest.url()})`
    });
  });

  test('manager can read reports and acknowledge milestones; front desk is redirected', async ({
    page
  }) => {
    let milestones: typeof INITIAL_MILESTONES & {
      finalPayment: { status: string; acknowledgedDate?: string };
    } = { ...INITIAL_MILESTONES };
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
    await trackBusinessViewListeners(page);
    await page.route('**/v1/business-delivery/**', (route) => {
      businessRequests.push(route.request().url());
      return json(route, {});
    });
    await login(page, 'admin');
    await page.goto('/staff');
    await expect(page.getByRole('link', { name: '商務與驗收' })).toBeVisible();
    const baseline = await businessListenerSnapshot(page);
    if (baseline === undefined)
      throw new Error('Business view listener instrumentation is unavailable.');
    const businessChunk = page.waitForRequest((request) =>
      /\/modules\/business-view\.[a-f0-9]+\.js$/.test(request.url())
    );
    await page.getByRole('link', { name: '商務與驗收' }).click();
    await businessChunk;
    await expect
      .poll(async () => {
        const mounted = await businessListenerSnapshot(page);
        return (
          mounted?.['beauessence:workbench-access-change'] -
          baseline['beauessence:workbench-access-change']
        );
      })
      .toBe(2);
    await expect(page.locator('#business-section')).toContainText(
      '此功能只在 C1 伺服器模式可用'
    );
    await expect(page.locator('#business-content')).toBeHidden();
    expect(businessRequests).toEqual([]);
    const mounted = await businessListenerSnapshot(page);
    expect(
      mounted?.['beauessence:workbench-access-change'] -
        baseline['beauessence:workbench-access-change']
    ).toBe(2);
    expect(mounted?.hashchange).toBe(baseline.hashchange);
    expect(mounted?.pagehide).toBe(baseline.pagehide);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('beauessence:workbench-access-change', {
          detail: { authorized: false }
        })
      );
    });
    await expect(page.locator('#business-section')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '商務與驗收' })).toHaveCount(0);
    await expect(page).toHaveURL(/#overview$/);
    expect(await businessListenerSnapshot(page)).toEqual({
      'beauessence:workbench-access-change':
        baseline['beauessence:workbench-access-change'] + 1,
      hashchange: baseline.hashchange,
      pagehide: baseline.pagehide
    });
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

  test('reuses an export key after a lost response and clears it after success', async ({
    page
  }) => {
    await enableServerSession(page);
    const job = {
      exportId: 'export_synthetic_retry_001',
      status: 'ready',
      format: 'csv',
      from: '2026-09-01',
      to: '2026-09-30',
      rowCount: 1,
      byteLength: 40,
      sha256: 'c'.repeat(64),
      createdAt: '2026-10-01T00:00:00.000Z',
      downloadExpiresAt: '2026-10-02T00:00:00.000Z',
      downloadsRemaining: 1,
      purgeAt: '2026-10-03T00:00:00.000Z'
    };
    const writes: Array<Record<string, unknown>> = [];
    const acceptedByKey = new Map<string, typeof job>();
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
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        const key = String(body.idempotencyKey);
        acceptedByKey.set(key, job);
        if (writes.length === 1) return route.abort('connectionreset');
        return json(route, acceptedByKey.get(key));
      }
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.goto('/staff#business-section');
    const fillExportDates = async () => {
      await page.getByLabel('起始日期（台北）').fill('2026-09-01');
      await page.getByLabel('結束日期（台北）').fill('2026-09-30');
    };
    const submitExport = () =>
      page.getByRole('button', { name: '重新登入並建立匯出' }).click();

    await fillExportDates();
    await submitExport();
    await expect(
      page.getByRole('button', { name: '重新登入並建立匯出' })
    ).toBeEnabled();
    expect(writes).toHaveLength(1);

    await page.getByRole('link', { name: '營運首頁' }).click();
    await expect(page).toHaveURL(/#overview$/);
    await page.getByRole('link', { name: '商務與驗收' }).click();
    await expect(page.locator('#business-section')).toContainText('月用量');
    await fillExportDates();
    await submitExport();
    await expect(page.locator('#business-section')).toContainText(
      '匯出工作已建立'
    );

    expect(writes[1]?.['idempotencyKey']).toBe(writes[0]?.['idempotencyKey']);
    await submitExport();
    await expect(
      page.getByRole('button', { name: '重新登入並建立匯出' })
    ).toBeEnabled();
    expect(writes).toHaveLength(3);
    expect(writes[2]?.['idempotencyKey']).not.toBe(
      writes[1]?.['idempotencyKey']
    );
  });

  for (const accessChange of [
    { name: 'authorization is revoked', authorized: false, csrf: null },
    {
      name: 'the manager session CSRF token rotates',
      authorized: true,
      csrf: 'csrf_rotated_session'
    }
  ]) {
    test(`does not download CSV after ${accessChange.name} during the response`, async ({
      page
    }) => {
      await enableServerSession(page);
      await trackBusinessViewListeners(page);
      const job = {
        exportId: 'export_synthetic_delayed_001',
        status: 'ready',
        format: 'csv',
        from: '2026-09-01',
        to: '2026-09-30',
        rowCount: 1,
        byteLength: 40,
        sha256: 'd'.repeat(64),
        createdAt: '2026-10-01T00:00:00.000Z',
        downloadExpiresAt: '2026-10-02T00:00:00.000Z',
        downloadsRemaining: 1,
        purgeAt: '2026-10-03T00:00:00.000Z'
      };
      await page.route('**/v1/business-delivery/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith('/monthly-usage')) return json(route, MONTHLY_USAGE);
        if (path.endsWith('/milestones'))
          return json(route, INITIAL_MILESTONES);
        if (path.endsWith('/pending-deletion'))
          return json(route, { patients: [] });
        if (
          path === '/v1/business-delivery/exports' &&
          request.method() === 'POST'
        )
          return json(route, job);
        return json(route, { error: { message: '找不到指定的資料。' } }, 404);
      });

      await page.addInitScript(() => {
        const state = window as Window & {
          __businessCsvTest?: {
            started: boolean;
            blobCreations: number;
            objectUrlCreations: number;
            resolveResponse?: () => void;
          };
        };
        const effects = {
          started: false,
          blobCreations: 0,
          objectUrlCreations: 0,
          resolveResponse: undefined as (() => void) | undefined
        };
        state.__businessCsvTest = effects;

        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          if (!url.endsWith('/download')) return originalFetch(input, init);
          effects.started = true;
          return new Promise((resolve) => {
            effects.resolveResponse = () =>
              resolve({
                ok: true,
                status: 200,
                text: () =>
                  Promise.resolve(
                    'opaque_id,created_at\nbooking_test_001,now\n'
                  )
              } as Response);
          });
        };

        const NativeBlob = window.Blob;
        Object.defineProperty(window, 'Blob', {
          configurable: true,
          value: new Proxy(NativeBlob, {
            construct(target, args, newTarget) {
              effects.blobCreations += 1;
              return Reflect.construct(target, args, newTarget);
            }
          })
        });
        const createObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          effects.objectUrlCreations += 1;
          return createObjectURL(blob);
        };
      });

      const { baseline } = await openBusinessViewWithListenerBaseline(page);
      await page.getByLabel('起始日期（台北）').fill('2026-09-01');
      await page.getByLabel('結束日期（台北）').fill('2026-09-30');
      await page.getByRole('button', { name: '重新登入並建立匯出' }).click();
      await expect(page.locator('#business-section')).toContainText(
        '匯出工作已建立'
      );

      let downloadObserved = false;
      page.on('download', () => {
        downloadObserved = true;
      });
      const clickDownload = page
        .getByRole('button', { name: '下載 CSV' })
        .click();
      await page.waitForFunction(
        () =>
          (window as Window & { __businessCsvTest?: { started: boolean } })
            .__businessCsvTest?.started === true
      );
      await page.evaluate((change) => {
        if (change.csrf === null) sessionStorage.removeItem('calPilotCsrf');
        else sessionStorage.setItem('calPilotCsrf', change.csrf);
        window.dispatchEvent(
          new CustomEvent('beauessence:workbench-access-change', {
            detail: { authorized: change.authorized }
          })
        );
        const state = window as Window & {
          __businessCsvTest?: { resolveResponse?: () => void };
        };
        state.__businessCsvTest?.resolveResponse?.();
      }, accessChange);
      await expect(page.locator('#business-section')).toHaveCount(0);
      await expect(page.getByRole('link', { name: '商務與驗收' })).toHaveCount(
        0
      );
      const disposed = await businessListenerSnapshot(page);
      expect(disposed).toEqual({
        'beauessence:workbench-access-change':
          baseline['beauessence:workbench-access-change'] + 1,
        hashchange: baseline.hashchange,
        pagehide: baseline.pagehide
      });
      await clickDownload;

      await expect
        .poll(() =>
          page.evaluate(() => {
            const state = window as Window & {
              __businessCsvTest?: {
                started: boolean;
                blobCreations: number;
                objectUrlCreations: number;
              };
            };
            const effects = state.__businessCsvTest;
            if (effects === undefined) return undefined;
            return {
              started: effects.started,
              blobCreations: effects.blobCreations,
              objectUrlCreations: effects.objectUrlCreations
            };
          })
        )
        .toEqual({
          started: true,
          blobCreations: 0,
          objectUrlCreations: 0
        });
      expect(downloadObserved).toBe(false);
    });
  }

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
    const DAY_MS = 24 * 60 * 60 * 1000;
    const NOTICE_DAYS = 30;
    const RETENTION_DAYS = 30;
    type TerminationReceipt = {
      receiptKind: string;
      evidenceRef?: string;
      exportId?: string;
      sha256?: string;
      actorRef: string;
      acknowledgedAt: string;
    };
    type TerminationRecord = {
      terminationId: 'termination_synthetic_001';
      state: string;
      noticeDate: string;
      noticeStartedAt: string;
      noticeDueAt: string;
      controlledRetentionUntil: string | null;
      version: number;
      receipts: TerminationReceipt[];
      closeReadiness: {
        ready: boolean;
        missingSteps: string[];
      };
    };
    let serverNow = '2026-10-01T00:00:00.000Z';
    let record: TerminationRecord = {
      terminationId: 'termination_synthetic_001',
      state: 'termination_pending',
      noticeDate: '2026-10-01',
      noticeStartedAt: serverNow,
      noticeDueAt: '2026-10-31T00:00:00.000Z',
      controlledRetentionUntil: null,
      version: 1,
      receipts: [],
      closeReadiness: { ready: false, missingSteps: [] }
    };
    const updateCloseReadiness = () => {
      const missingSteps: string[] = [];
      if (Date.parse(serverNow) < Date.parse(record.noticeDueAt))
        missingSteps.push('minimum_notice');
      if (
        !record.receipts.some(
          (receipt) => receipt.receiptKind === 'data_return'
        )
      )
        missingSteps.push('data_return');
      if (
        record.controlledRetentionUntil === null ||
        Date.parse(serverNow) < Date.parse(record.controlledRetentionUntil)
      )
        missingSteps.push('controlled_copy_retention');
      for (const kind of [
        'backup_disposition',
        'audit_disposition',
        'access_revocation'
      ])
        if (!record.receipts.some((receipt) => receipt.receiptKind === kind))
          missingSteps.push(kind);
      record = {
        ...record,
        closeReadiness: { ready: missingSteps.length === 0, missingSteps }
      };
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
        const noticeDate = String(body.noticeDate);
        const noticeStartedAt = `${noticeDate}T00:00:00.000Z`;
        serverNow = noticeStartedAt;
        record = {
          ...record,
          noticeDate,
          noticeStartedAt,
          noticeDueAt: new Date(
            Date.parse(noticeStartedAt) + NOTICE_DAYS * DAY_MS
          ).toISOString()
        };
        updateCloseReadiness();
        return json(route, record);
      }
      if (path.endsWith('/acknowledgements') && request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ path, body, headers: request.headers() });
        const receiptKind = String(body.receiptKind);
        const acknowledgedAt = serverNow;
        const exportId = body.exportId;
        const evidenceRef = body.evidenceRef;
        const receiptEvidence =
          typeof exportId === 'string'
            ? { exportId, sha256: 'b'.repeat(64) }
            : typeof evidenceRef === 'string'
              ? { evidenceRef }
              : undefined;
        if (receiptEvidence === undefined)
          throw new Error('The synthetic receipt evidence is malformed.');
        const receipt = {
          receiptKind,
          ...receiptEvidence,
          actorRef: 'actor_synthetic_001',
          acknowledgedAt
        };
        record = {
          ...record,
          version: record.version + 1,
          state:
            receiptKind === 'data_return'
              ? 'controlled_retention'
              : record.state,
          controlledRetentionUntil:
            receiptKind === 'data_return'
              ? new Date(
                  Date.parse(acknowledgedAt) + RETENTION_DAYS * DAY_MS
                ).toISOString()
              : record.controlledRetentionUntil,
          receipts: [...record.receipts, receipt]
        };
        updateCloseReadiness();
        return json(route, { ...record, receipt });
      }
      if (path.endsWith('/close') && request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ path, body, headers: request.headers() });
        updateCloseReadiness();
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
        updateCloseReadiness();
        return json(route, record);
      }
      return json(route, { error: { message: '找不到指定的資料。' } }, 404);
    });

    await page.clock.setFixedTime(new Date('2026-10-01T04:00:00.000Z'));
    await page.goto('/staff#business-section');
    const noticeDate = await page.getByLabel('通知日期（台北）').inputValue();
    expect(noticeDate).toBe('2026-10-01');
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
    expect(record.noticeStartedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(record.noticeDueAt).toBe('2026-10-31T00:00:00.000Z');

    await page.getByLabel('合作個案識別碼').fill('termination_synthetic_001');
    await page.getByRole('button', { name: '載入合作個案' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '合作終止通知進行中'
    );
    await expect(page.locator('#business-section')).toContainText(
      '尚無確認紀錄'
    );
    expect(record.receipts).toHaveLength(0);
    await page.getByRole('button', { name: '重新登入並送交結案審查' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '409：仍缺少'
    );
    expect(record.closeReadiness.missingSteps).toContain('minimum_notice');
    expect(record.state).not.toBe('manual_close_review');

    serverNow = record.noticeDueAt;
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
    expect(record.controlledRetentionUntil).toBe('2026-11-30T00:00:00.000Z');
    expect(record.receipts[0]?.acknowledgedAt).toBe('2026-10-31T00:00:00.000Z');
    await page.getByRole('button', { name: '重新登入並送交結案審查' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '409：仍缺少'
    );
    expect(record.closeReadiness.missingSteps).toContain(
      'controlled_copy_retention'
    );
    expect(record.state).not.toBe('manual_close_review');

    serverNow = '2026-11-30T00:00:00.001Z';
    await page.getByRole('button', { name: '載入合作個案' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '必要步驟已記錄，可送交人工結案審查。'
    );
    await page.getByRole('button', { name: '重新登入並送交結案審查' }).click();
    await expect(page.locator('#business-section')).toContainText(
      '已提交人工結案審查；服務仍待人員確認，系統沒有停用服務或刪除資料。'
    );
    expect(record.state).toBe('manual_close_review');
    expect(writes.some((write) => /terminate|delete/.test(write.path))).toBe(
      false
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
