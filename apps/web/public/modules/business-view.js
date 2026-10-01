import { taipeiTodayDate } from './taipei-time.js';
import { formatDateTime } from './ui-format.js';

const REAUTH_TIMEOUT_MS = 120_000;
const RETENTION_REASONS = Object.freeze([
  ['patient_request', '患者要求'],
  ['retention_expired', '保存期限已到'],
  ['duplicate_record', '重複紀錄'],
  ['other', '其他']
]);

const COMPLETENESS_LABELS = Object.freeze({
  complete: '完整',
  partial: '部分完整',
  unknown: '未知'
});
const USAGE_LABELS = Object.freeze({
  used: '本月有使用',
  unused: '本月未使用',
  insufficient_evidence: '資料不足，需人工確認'
});
const EXPORT_STATUS_LABELS = Object.freeze({
  ready: '可下載',
  exhausted: '下載次數已用完',
  expired: '已到期',
  revoked: '已撤銷',
  purged: '檔案已清除'
});
const MILESTONE_STATUS_LABELS = Object.freeze({
  not_started: '尚未開始',
  in_progress: '進行中',
  ended: '已結束',
  awaiting_acknowledgement: '等待主管確認',
  acknowledged: '已確認',
  blocked: '條件未完成',
  scheduled: '已排定',
  active: '進行中',
  reached: '已達成'
});
const TERMINATION_STATE_LABELS = Object.freeze({
  termination_pending: '合作終止通知進行中',
  controlled_retention: '受控保留期',
  manual_close_review: '已提交人工結案審查'
});
const TERMINATION_RECEIPT_LABELS = Object.freeze({
  data_return: '資料返還',
  controlled_copy_retention: '受控副本保存',
  backup_disposition: '備份處置',
  audit_disposition: '稽核紀錄處置',
  access_revocation: '帳號權限撤銷'
});

function customEvent(type, detail) {
  return new CustomEvent(type, { detail });
}

/** Requests a fresh token without persisting it. The popup request is dispatched
 * before this function returns, preserving the user's click activation. */
export function requestFreshIdToken({
  timeoutMs = REAUTH_TIMEOUT_MS,
  signal,
  target = globalThis.window
} = {}) {
  if (target === undefined)
    return Promise.reject(new Error('重新登入功能目前無法使用'));
  const requestId = globalThis.crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      target.removeEventListener('beauessence:reauth-result', onResult);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const cancelProviderRequest = () =>
      target.dispatchEvent(
        customEvent('beauessence:reauth-cancel', { requestId })
      );
    const onResult = (event) => {
      if (event.detail?.requestId !== requestId) return;
      if (
        typeof event.detail.idToken === 'string' &&
        event.detail.idToken !== ''
      )
        finish(resolve, event.detail.idToken);
      else finish(reject, new Error(event.detail.error ?? '重新登入未完成'));
    };
    const onAbort = () => {
      cancelProviderRequest();
      finish(reject, new Error('重新登入已取消'));
    };
    const timer = globalThis.setTimeout(() => {
      cancelProviderRequest();
      finish(reject, new Error('重新登入逾時'));
    }, timeoutMs);

    target.addEventListener('beauessence:reauth-result', onResult);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    target.dispatchEvent(
      customEvent('beauessence:reauth-request', { requestId })
    );
  });
}

/** Shared same-origin API boundary for this tab. No token is persisted. */
export async function requestBusinessApi(
  path,
  {
    method = 'GET',
    body,
    reauthToken,
    signal,
    fetchImpl = globalThis.fetch,
    storage = globalThis.sessionStorage,
    responseType = 'json'
  } = {}
) {
  const csrf = storage?.getItem('calPilotCsrf');
  if (typeof csrf !== 'string' || csrf === '')
    throw new Error('此功能只在 C1 伺服器模式可用');

  const verb = method.toUpperCase();
  const headers = {
    Accept: responseType === 'text' ? 'text/csv' : 'application/json'
  };
  if (verb !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = csrf;
  }
  if (typeof reauthToken === 'string' && reauthToken !== '')
    headers['x-reauth-id-token'] = reauthToken;

  const response = await fetchImpl(path, {
    method: verb,
    credentials: 'same-origin',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal === undefined ? {} : { signal })
  });
  const raw =
    responseType === 'text'
      ? await response.text()
      : await response.json().catch(() => ({}));
  if (!response.ok) {
    let errorBody = raw;
    if (typeof raw === 'string') {
      try {
        errorBody = JSON.parse(raw || '{}');
      } catch {
        errorBody = {};
      }
    }
    const error = new Error(errorBody?.error?.message ?? '目前無法完成操作。');
    error.status = response.status;
    throw error;
  }
  return responseType === 'text' ? { response, content: raw } : raw;
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function button(label, className = 'button button-secondary', type = 'button') {
  const node = element('button', className, label);
  node.type = type;
  return node;
}

function makeField(labelText, control, hint) {
  const label = element('label');
  label.append(document.createTextNode(labelText), control);
  if (hint) {
    const note = element('span', 'section-description', hint);
    label.append(note);
  }
  return label;
}

function input(type, name, options = {}) {
  const node = document.createElement('input');
  node.type = type;
  node.name = name;
  node.required = options.required ?? true;
  if (options.min) node.min = options.min;
  if (options.max) node.max = options.max;
  if (options.value) node.value = options.value;
  if (options.inputMode) node.inputMode = options.inputMode;
  if (options.autocomplete) node.autocomplete = options.autocomplete;
  return node;
}

function reasonSelect(name) {
  const select = document.createElement('select');
  select.name = name;
  select.required = true;
  for (const [value, label] of RETENTION_REASONS) {
    const option = element('option', '', label);
    option.value = value;
    select.append(option);
  }
  return select;
}

function dateLabel(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '日期無法判讀' : formatDateTime(parsed);
}

function monthStatus(data) {
  const lines = [
    ['月份', data.month],
    [
      '使用範圍',
      data.scope === 'internal_synthetic' ? '合成內部測試' : '正式範圍'
    ],
    ['資料完整度', COMPLETENESS_LABELS[data.completeness] ?? '未知'],
    ['員工人數', String(data.uniqueStaffUsers)],
    ['預約建立數', String(data.bookingCreatedCount)],
    ['使用分類', USAGE_LABELS[data.usageClassification] ?? '需人工確認'],
    [
      '維護費',
      data.maintenanceFeeTwd === null
        ? '需人工確認'
        : `NT$ ${new Intl.NumberFormat('zh-TW').format(data.maintenanceFeeTwd)}`
    ],
    ['資料鎖定時間', dateLabel(data.lockedAt)]
  ];
  const list = element('dl', 'business-details');
  for (const [key, value] of lines) {
    list.append(element('dt', '', key), element('dd', '', value));
  }
  return list;
}

function milestoneText(value) {
  const status = MILESTONE_STATUS_LABELS[value.status] ?? '狀態需人工確認';
  if (value.startDate && value.endExclusiveDate)
    return `${status} · ${value.startDate} 至 ${value.endExclusiveDate}（不含）`;
  const date =
    value.startDate ??
    value.endExclusiveDate ??
    value.launchDate ??
    value.checkpointDate ??
    value.acknowledgedDate;
  return date ? `${status} · ${date}` : status;
}

function reportError(error) {
  const message = error instanceof Error ? error.message : '目前無法完成操作。';
  return error?.status === 409 ? `409：${message}` : message;
}

/** Mounts the business workbench. A missing C1 CSRF token is a strict
 * no-network mode and leaves only the unavailable message visible. */
export function initializeBusinessView({
  root = document.querySelector('#business-section'),
  authorized = () => true,
  storage = globalThis.sessionStorage,
  target = globalThis.window,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!root || !root.isConnected || !authorized()) return () => {};
  const availability = root.querySelector('#business-availability');
  const content = root.querySelector('#business-content');
  const csrf = storage?.getItem('calPilotCsrf');
  const navLink = target.document.querySelector(
    '[data-workspace-nav][href="#business-section"]'
  );
  if (typeof csrf !== 'string' || csrf === '') {
    const onAccessChange = (event) => {
      if (event.detail?.authorized === true) return;
      root.remove();
      navLink?.remove();
      target.history.replaceState(null, '', '#overview');
    };
    target.addEventListener(
      'beauessence:workbench-access-change',
      onAccessChange
    );
    return () =>
      target.removeEventListener(
        'beauessence:workbench-access-change',
        onAccessChange
      );
  }

  if (!availability || !content) return () => {};

  const heading = root.querySelector('#business-heading');
  heading.classList.remove('visually-hidden');
  availability.hidden = true;
  content.hidden = false;
  let disposed = false;
  let activeController;
  const viewController = new AbortController();
  const idempotencyKeys = new Map();
  const status = element('p', 'form-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const stopPending = () => {
    activeController?.abort();
    activeController = undefined;
    viewController.abort();
  };
  const setStatus = (message, state = 'info') => {
    status.textContent = message;
    status.dataset.state = state;
  };
  const api = (path, options = {}) =>
    requestBusinessApi(path, {
      ...options,
      signal: options.signal ?? viewController.signal,
      storage,
      target,
      fetchImpl
    });
  const idempotencyKey = (action, payload) =>
    `${action}\u0000${JSON.stringify(payload)}`;
  const nextKey = (action, payload) => {
    const fingerprint = idempotencyKey(action, payload);
    const previous = idempotencyKeys.get(fingerprint);
    if (previous) return previous;
    const key = globalThis.crypto.randomUUID().replaceAll('-', '');
    idempotencyKeys.set(fingerprint, key);
    return key;
  };
  const clearKey = (action, payload) =>
    idempotencyKeys.delete(idempotencyKey(action, payload));
  const runWrite = async (
    control,
    action,
    path,
    payload,
    {
      reauthenticate = false,
      refresh = false,
      responseLabel = () => '操作已完成。'
    } = {}
  ) => {
    if (disposed || !authorized() || activeController) return;
    const key = nextKey(action, payload);
    const body = { idempotencyKey: key, ...payload };
    const controller = new AbortController();
    activeController = controller;
    control.disabled = true;
    setStatus(reauthenticate ? '正在重新登入…' : '正在送出…');
    try {
      // This is deliberately the first asynchronous operation. The request
      // event reaches Firebase synchronously from the user's submit gesture.
      const reauthToken = reauthenticate
        ? await requestFreshIdToken({ target, signal: controller.signal })
        : undefined;
      const result = await api(path, {
        method: 'POST',
        body,
        signal: controller.signal,
        ...(reauthToken === undefined ? {} : { reauthToken })
      });
      clearKey(action, payload);
      setStatus(responseLabel(result), 'success');
      if (refresh) await loadPendingDeletion();
      return result;
    } catch (error) {
      if (!controller.signal.aborted) setStatus(reportError(error), 'error');
      return false;
    } finally {
      if (activeController === controller) activeController = undefined;
      control.disabled = false;
    }
  };

  const headingRow = element('div', 'section-heading');
  headingRow.append(
    heading,
    element(
      'p',
      'section-description',
      '僅顯示合計與不透明識別碼；稽核、權限與資料保存由伺服器執行。'
    )
  );
  const monthPanel = element('article', 'event-panel');
  monthPanel.append(element('h3', '', '月用量'));
  const monthForm = document.createElement('form');
  monthForm.className = 'filter-bar';
  const monthInput = input('month', 'month', {
    value: taipeiTodayDate().slice(0, 7)
  });
  const monthSubmit = button('查看月報', 'button button-primary', 'submit');
  monthForm.append(makeField('報表月份', monthInput), monthSubmit);
  const monthOutput = element('div', 'empty-state', '選擇月份以查看月用量。');
  monthPanel.append(monthForm, monthOutput);

  const milestonePanel = element('article', 'event-panel');
  milestonePanel.append(element('h3', '', '里程碑與驗收'));
  const milestoneOutput = element('div', 'card-list');
  const milestoneForms = element('div', 'card-list');
  milestonePanel.append(milestoneOutput, milestoneForms);

  const exportPanel = element('article', 'event-panel');
  exportPanel.append(element('h3', '', '預約 CSV 匯出'));
  exportPanel.append(
    element(
      'p',
      'section-description',
      '僅匯出白名單預約欄位，不含稽核紀錄；檔案有下載次數與保存期限限制。'
    )
  );
  const exportForm = document.createElement('form');
  exportForm.className = 'filter-bar';
  const exportFrom = input('date', 'from');
  const exportTo = input('date', 'to');
  const exportSubmit = button(
    '重新登入並建立匯出',
    'button button-primary',
    'submit'
  );
  exportForm.append(
    makeField('起始日期（台北）', exportFrom),
    makeField('結束日期（台北）', exportTo),
    exportSubmit
  );
  const exportList = element('div', 'card-list');
  exportPanel.append(exportForm, exportList);

  const retentionPanel = element('article', 'event-panel');
  retentionPanel.append(element('h3', '', '封存與保存管理'));
  retentionPanel.append(
    element(
      'p',
      'section-description',
      '清單不含姓名。封存與永久刪除需要重新登入；30 天內可復原，有 legal hold 時不能永久刪除。'
    )
  );
  const retentionForms = element('div', 'card-list');
  const pendingHeader = element('div', 'list-section-heading');
  pendingHeader.append(element('h4', '', '待永久刪除清單'));
  const refreshPending = button('重新整理清單');
  pendingHeader.append(refreshPending);
  const pendingSummary = element('p', 'result-summary', '尚未載入清單。');
  const pendingList = element('div', 'card-list');
  retentionPanel.append(
    retentionForms,
    pendingHeader,
    pendingSummary,
    pendingList
  );

  const terminationPanel = element('article', 'event-panel');
  terminationPanel.append(element('h3', '', '合作終止與資料返還'));
  terminationPanel.append(
    element(
      'p',
      'section-description',
      '送交結案只會進入人工審查，不會執行服務終止或資料刪除。帳號撤權仍須由人員實際操作並核對。'
    )
  );
  const noticeForm = document.createElement('form');
  noticeForm.className = 'filter-bar';
  const noticeDate = input('date', 'noticeDate', { value: taipeiTodayDate() });
  noticeDate.readOnly = true;
  const noticeSubmit = button(
    '重新登入並開啟終止通知',
    'button button-primary',
    'submit'
  );
  noticeForm.append(makeField('通知日期（台北）', noticeDate), noticeSubmit);
  const terminationLoadForm = document.createElement('form');
  terminationLoadForm.className = 'filter-bar';
  const terminationId = input('text', 'terminationId', { autocomplete: 'off' });
  const terminationLoad = button(
    '載入合作個案',
    'button button-secondary',
    'submit'
  );
  terminationLoadForm.append(
    makeField('合作個案識別碼', terminationId),
    terminationLoad
  );
  const terminationOutput = element('div', 'card-list');
  const acknowledgmentForm = document.createElement('form');
  acknowledgmentForm.className = 'filter-bar';
  const receiptKind = document.createElement('select');
  receiptKind.name = 'receiptKind';
  for (const [kind, label] of [
    ['data_return', '資料返還'],
    ['backup_disposition', '備份處置'],
    ['audit_disposition', '稽核紀錄處置'],
    ['access_revocation', '帳號權限撤銷']
  ]) {
    const option = element('option', '', label);
    option.value = kind;
    receiptKind.append(option);
  }
  const exportId = input('text', 'exportId', { autocomplete: 'off' });
  const evidenceRef = input('text', 'evidenceRef', { autocomplete: 'off' });
  const exportField = makeField('已簽收匯出識別碼', exportId);
  const evidenceField = makeField('人工核對證據編號', evidenceRef);
  const acknowledgmentSubmit = button(
    '重新登入並記錄確認',
    'button button-primary',
    'submit'
  );
  acknowledgmentForm.append(
    makeField('確認項目', receiptKind),
    exportField,
    evidenceField,
    acknowledgmentSubmit
  );
  const closeForm = document.createElement('form');
  closeForm.className = 'filter-bar';
  const closeSubmit = button(
    '重新登入並送交結案審查',
    'button button-danger-outline',
    'submit'
  );
  closeForm.append(closeSubmit);
  terminationPanel.append(
    noticeForm,
    terminationLoadForm,
    terminationOutput,
    acknowledgmentForm,
    closeForm
  );

  const layout = element('div', 'events-grid');
  layout.append(
    monthPanel,
    milestonePanel,
    exportPanel,
    retentionPanel,
    terminationPanel
  );
  content.replaceChildren(headingRow, status, layout);

  const loadMonth = async () => {
    monthSubmit.disabled = true;
    monthOutput.textContent = '正在載入月報…';
    try {
      const data = await api(
        `/v1/business-delivery/monthly-usage?month=${encodeURIComponent(monthInput.value)}`
      );
      if (!disposed) monthOutput.replaceChildren(monthStatus(data));
    } catch (error) {
      if (!disposed) monthOutput.textContent = reportError(error);
    } finally {
      monthSubmit.disabled = false;
    }
  };

  const loadMilestones = async () => {
    milestoneOutput.replaceChildren(element('li', '', '正在載入里程碑…'));
    try {
      const data = await api('/v1/business-delivery/milestones');
      if (disposed) return;
      const rows = [
        ['試營運', data.trial],
        ['正式上線', data.formalLaunch],
        ['正式營運', data.formalOperation],
        ['尾款', data.finalPayment],
        ['維護期', data.maintenance]
      ];
      milestoneOutput.replaceChildren(
        ...rows.map(([label, value]) => {
          const item = element('article', 'event-panel');
          item.append(
            element('h4', '', label),
            element('p', '', milestoneText(value))
          );
          return item;
        })
      );
      milestoneForms.replaceChildren();
      if (data.formalLaunch.status === 'awaiting_acknowledgement') {
        const form = document.createElement('form');
        form.className = 'filter-bar';
        const launchDate = input('date', 'launchDate');
        const evidenceRef = input('text', 'evidenceRef', {
          inputMode: 'text',
          autocomplete: 'off'
        });
        const submit = button(
          '重新登入並確認正式上線日',
          'button button-primary',
          'submit'
        );
        form.append(
          makeField('正式上線日', launchDate),
          makeField('證據編號', evidenceRef),
          submit
        );
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = {
            expectedVersion: data.revision,
            evidenceRef: evidenceRef.value,
            launchDate: launchDate.value
          };
          if (
            await runWrite(
              submit,
              'formal_launch',
              '/v1/business-delivery/milestones/formal_launch/acknowledgements',
              payload,
              { reauthenticate: true }
            )
          )
            await loadMilestones();
        });
        milestoneForms.append(form);
      }
      if (data.finalPayment.status === 'awaiting_acknowledgement') {
        const form = document.createElement('form');
        form.className = 'filter-bar';
        const evidenceRef = input('text', 'evidenceRef', {
          inputMode: 'text',
          autocomplete: 'off'
        });
        const submit = button(
          '重新登入並確認尾款',
          'button button-primary',
          'submit'
        );
        form.append(makeField('尾款證據編號', evidenceRef), submit);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (
            await runWrite(
              submit,
              'final_payment',
              '/v1/business-delivery/milestones/final_payment/acknowledgements',
              {
                expectedVersion: data.revision,
                evidenceRef: evidenceRef.value
              },
              { reauthenticate: true }
            )
          )
            await loadMilestones();
        });
        milestoneForms.append(form);
      }
    } catch (error) {
      milestoneOutput.replaceChildren(
        element('p', 'form-status', reportError(error))
      );
    }
  };

  const updateExportCard = (card, job) => {
    card.querySelector('[data-export-status]').textContent =
      EXPORT_STATUS_LABELS[job.status] ?? '狀態需人工確認';
    card.querySelector('[data-export-summary]').textContent =
      `${job.from} 至 ${job.to} · ${job.rowCount} 列 · 剩餘 ${job.downloadsRemaining} 次下載 · ${job.byteLength} bytes · 下載期限 ${dateLabel(job.downloadExpiresAt)} · 清除期限 ${dateLabel(job.purgeAt)}`;
    card.querySelector('[data-export-hash]').textContent =
      `SHA-256：${job.sha256}`;
    const download = card.querySelector('[data-export-download]');
    download.hidden = job.status !== 'ready' || job.downloadsRemaining === 0;
    const revoke = card.querySelector('[data-export-revoke]');
    revoke.hidden = !['ready', 'exhausted'].includes(job.status);
  };

  const makeExportCard = (job) => {
    const card = element('article', 'event-panel');
    const heading = element('h4', '', '匯出工作');
    const state = element(
      'p',
      'status-chip',
      EXPORT_STATUS_LABELS[job.status] ?? '狀態需人工確認'
    );
    state.dataset.exportStatus = '';
    const summary = element('p', '', '');
    summary.dataset.exportSummary = '';
    const hash = element('p', 'code', '');
    hash.dataset.exportHash = '';
    const actions = element('div', 'actions');
    const refresh = button('查詢狀態');
    const download = button('下載 CSV', 'button button-primary');
    download.dataset.exportDownload = '';
    const revoke = button('撤銷匯出', 'button button-danger-outline');
    revoke.dataset.exportRevoke = '';
    actions.append(refresh, download, revoke);
    card.append(heading, state, summary, hash, actions);
    updateExportCard(card, job);
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      try {
        const next = await api(
          `/v1/business-delivery/exports/${encodeURIComponent(job.exportId)}`
        );
        Object.assign(job, next);
        updateExportCard(card, job);
        setStatus('匯出狀態已更新。', 'success');
      } catch (error) {
        setStatus(reportError(error), 'error');
      } finally {
        refresh.disabled = false;
      }
    });
    download.addEventListener('click', async () => {
      download.disabled = true;
      try {
        const result = await api(
          `/v1/business-delivery/exports/${encodeURIComponent(job.exportId)}/download`,
          { responseType: 'text' }
        );
        const objectUrl = URL.createObjectURL(
          new Blob([result.content], { type: 'text/csv' })
        );
        const anchor = element('a');
        anchor.href = objectUrl;
        anchor.download = `export-${job.from}-${job.to}.csv`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        const remaining = Math.max(0, job.downloadsRemaining - 1);
        Object.assign(job, { downloadsRemaining: remaining });
        updateExportCard(card, job);
        setStatus('CSV 已下載。', 'success');
      } catch (error) {
        setStatus(reportError(error), 'error');
      } finally {
        download.disabled = false;
      }
    });
    revoke.addEventListener('click', async () => {
      const revokeBody = {};
      const revoked = await runWrite(
        revoke,
        `export-revoke-${job.exportId}`,
        `/v1/business-delivery/exports/${encodeURIComponent(job.exportId)}/revoke`,
        revokeBody
      );
      if (revoked) {
        Object.assign(job, { status: 'revoked', downloadsRemaining: 0 });
        updateExportCard(card, job);
      }
    });
    return card;
  };

  exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (exportTo.value < exportFrom.value) {
      setStatus('結束日期不可早於起始日期。', 'error');
      exportTo.focus();
      return;
    }
    const payload = {
      format: 'csv',
      from: exportFrom.value,
      to: exportTo.value
    };
    const key = nextKey('export-create', payload);
    const controller = new AbortController();
    if (activeController) return;
    activeController = controller;
    exportSubmit.disabled = true;
    setStatus('正在重新登入…');
    try {
      const reauthToken = await requestFreshIdToken({
        target,
        signal: controller.signal
      });
      const job = await api('/v1/business-delivery/exports', {
        method: 'POST',
        body: { idempotencyKey: key, ...payload },
        reauthToken,
        signal: controller.signal
      });
      clearKey('export-create', payload);
      exportList.prepend(makeExportCard(job));
      setStatus('匯出工作已建立。', 'success');
    } catch (error) {
      if (!controller.signal.aborted) setStatus(reportError(error), 'error');
    } finally {
      if (activeController === controller) activeController = undefined;
      exportSubmit.disabled = false;
    }
  });

  const patientField = (name) => input('text', name, { autocomplete: 'off' });
  const archiveForm = document.createElement('form');
  archiveForm.className = 'filter-bar';
  const archiveId = patientField('patientId');
  const archiveSubmit = button(
    '重新登入並封存',
    'button button-primary',
    'submit'
  );
  archiveForm.append(makeField('患者不透明識別碼', archiveId), archiveSubmit);
  archiveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (
      await runWrite(
        archiveSubmit,
        'retention-archive',
        '/v1/business-delivery/retention/archive',
        { patientId: archiveId.value },
        {
          reauthenticate: true,
          refresh: true,
          responseLabel: (result) =>
            `已封存，可復原至 ${dateLabel(result.restorableUntil)}。`
        }
      )
    )
      archiveId.value = '';
  });

  const restoreForm = document.createElement('form');
  restoreForm.className = 'filter-bar';
  const restoreId = patientField('patientId');
  const restoreSubmit = button(
    '復原封存患者',
    'button button-secondary',
    'submit'
  );
  restoreForm.append(makeField('患者不透明識別碼', restoreId), restoreSubmit);
  restoreForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (
      await runWrite(
        restoreSubmit,
        'retention-restore',
        '/v1/business-delivery/retention/restore',
        { patientId: restoreId.value },
        { refresh: true, responseLabel: () => '封存資料已復原。' }
      )
    )
      restoreId.value = '';
  });

  const holdForm = document.createElement('form');
  holdForm.className = 'filter-bar';
  const holdId = patientField('patientId');
  const hold = document.createElement('select');
  hold.name = 'hold';
  hold.append(
    Object.assign(element('option', '', '設定 legal hold'), { value: 'true' }),
    Object.assign(element('option', '', '解除 legal hold'), { value: 'false' })
  );
  const holdReason = reasonSelect('reasonCode');
  const holdSubmit = button(
    '更新 legal hold',
    'button button-secondary',
    'submit'
  );
  holdForm.append(
    makeField('患者不透明識別碼', holdId),
    makeField('legal hold', hold),
    makeField('原因代碼', holdReason),
    holdSubmit
  );
  holdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runWrite(
      holdSubmit,
      'retention-legal-hold',
      '/v1/business-delivery/retention/legal-hold',
      {
        patientId: holdId.value,
        hold: hold.value === 'true',
        reasonCode: holdReason.value
      },
      {
        refresh: true,
        responseLabel: (result) =>
          result.legalHold ? 'legal hold 已設定。' : 'legal hold 已解除。'
      }
    );
  });

  const deleteForm = document.createElement('form');
  deleteForm.className = 'filter-bar';
  const deleteId = patientField('patientId');
  const deleteReason = reasonSelect('reasonCode');
  const confirmationLabel = element('label');
  const confirmation = input('checkbox', 'confirmed');
  confirmation.required = false;
  confirmationLabel.append(
    confirmation,
    document.createTextNode('我確認永久刪除此患者資料')
  );
  const deleteSubmit = button(
    '重新登入並永久刪除',
    'button button-danger-outline',
    'submit'
  );
  deleteForm.append(
    makeField('患者不透明識別碼', deleteId),
    makeField('原因代碼', deleteReason),
    confirmationLabel,
    deleteSubmit
  );
  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!confirmation.checked) {
      setStatus('請先確認永久刪除。', 'error');
      confirmation.focus();
      return;
    }
    if (
      await runWrite(
        deleteSubmit,
        'retention-permanent-delete',
        '/v1/business-delivery/retention/permanent-delete',
        { patientId: deleteId.value, reasonCode: deleteReason.value },
        {
          reauthenticate: true,
          refresh: true,
          responseLabel: (result) =>
            `永久刪除已完成；伺服器回報 ${Object.keys(result.layers).length} 個資料層。`
        }
      )
    ) {
      deleteId.value = '';
      confirmation.checked = false;
    }
  });

  retentionForms.append(archiveForm, restoreForm, holdForm, deleteForm);

  async function loadPendingDeletion() {
    refreshPending.disabled = true;
    pendingSummary.textContent = '正在載入清單…';
    try {
      const data = await api(
        '/v1/business-delivery/retention/pending-deletion'
      );
      if (disposed) return;
      pendingList.replaceChildren();
      pendingSummary.textContent = `${data.patients.length} 位患者待處理。`;
      for (const patient of data.patients) {
        const item = element('article', 'event-panel');
        item.append(
          element('strong', '', patient.patientId),
          element('p', '', `封存時間：${dateLabel(patient.archivedAt)}`),
          element('p', '', `可復原期限：${dateLabel(patient.restorableUntil)}`),
          element(
            'p',
            '',
            patient.legalHold ? 'legal hold：已設定' : 'legal hold：未設定'
          )
        );
        const useId = button('填入患者識別碼');
        useId.addEventListener('click', () => {
          for (const field of [archiveId, restoreId, holdId, deleteId])
            field.value = patient.patientId;
          archiveId.focus();
        });
        item.append(useId);
        pendingList.append(item);
      }
    } catch (error) {
      pendingList.replaceChildren();
      pendingSummary.textContent = reportError(error);
    } finally {
      refreshPending.disabled = false;
    }
  }
  refreshPending.addEventListener('click', () => void loadPendingDeletion());

  let terminationCase;
  const renderTerminationCase = (record) => {
    terminationCase = record;
    terminationId.value = record.terminationId;
    const card = element('article', 'event-panel');
    card.append(
      element(
        'h4',
        '',
        TERMINATION_STATE_LABELS[record.state] ?? '狀態需人工確認'
      ),
      element('p', '', `個案識別碼：${record.terminationId}`),
      element('p', '', `通知日期：${record.noticeDate}`),
      element('p', '', `通知時間：${dateLabel(record.noticeStartedAt)}`),
      element('p', '', `通知期限：${dateLabel(record.noticeDueAt)}`),
      element(
        'p',
        '',
        `受控保存期限：${record.controlledRetentionUntil ? dateLabel(record.controlledRetentionUntil) : '尚未排定'}`
      )
    );
    if (record.state === 'manual_close_review')
      card.append(
        element(
          'p',
          'form-status',
          '已提交人工結案審查；服務仍待人員確認，系統沒有停用服務或刪除資料。'
        )
      );
    const readiness = record.closeReadiness ?? {
      ready: false,
      missingSteps: []
    };
    card.append(
      element(
        'p',
        'result-summary',
        readiness.ready
          ? '必要步驟已記錄，可送交人工結案審查。'
          : `尚缺：${(readiness.missingSteps ?? []).map((step) => TERMINATION_RECEIPT_LABELS[step] ?? step).join('、') || '伺服器尚未提供清單'}`
      )
    );
    const receipts = element('div', 'card-list');
    for (const receipt of record.receipts ?? []) {
      const label =
        TERMINATION_RECEIPT_LABELS[receipt.receiptKind] ?? '確認項目';
      const item = element('p', 'section-description');
      const details = [
        label,
        `操作者 ${receipt.actorRef ?? '未提供'}`,
        `時間 ${receipt.acknowledgedAt ? dateLabel(receipt.acknowledgedAt) : '未提供'}`
      ];
      if (receipt.evidenceRef) details.push(`證據 ${receipt.evidenceRef}`);
      if (receipt.exportId) details.push(`匯出 ${receipt.exportId}`);
      if (receipt.sha256) details.push(`SHA-256 ${receipt.sha256}`);
      item.textContent = details.join(' · ');
      receipts.append(item);
    }
    if (receipts.childElementCount === 0)
      receipts.append(element('p', 'section-description', '尚無確認紀錄。'));
    card.append(element('h4', '', '已記錄的確認'), receipts);
    terminationOutput.replaceChildren(card);
    closeSubmit.disabled = false;
  };

  async function loadTermination(
    id = terminationId.value,
    { preserveStatus = false } = {}
  ) {
    if (id === '') {
      setStatus('請輸入合作個案識別碼。', 'error');
      terminationId.focus();
      return undefined;
    }
    const previousStatus = status.textContent;
    terminationLoad.disabled = true;
    terminationOutput.textContent = '正在載入合作個案…';
    try {
      const record = await api(
        `/v1/business-delivery/terminations/${encodeURIComponent(id)}`
      );
      if (disposed) return undefined;
      renderTerminationCase(record);
      if (preserveStatus) status.textContent = previousStatus;
      return record;
    } catch (error) {
      terminationOutput.textContent = reportError(error);
      if (!preserveStatus) setStatus(reportError(error), 'error');
      return undefined;
    } finally {
      terminationLoad.disabled = false;
    }
  }

  const updateAcknowledgementFields = () => {
    const dataReturn = receiptKind.value === 'data_return';
    exportField.hidden = !dataReturn;
    exportId.disabled = !dataReturn;
    evidenceField.hidden = dataReturn;
    evidenceRef.disabled = dataReturn;
  };
  receiptKind.addEventListener('change', updateAcknowledgementFields);
  updateAcknowledgementFields();
  noticeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await runWrite(
      noticeSubmit,
      'termination-open',
      '/v1/business-delivery/terminations',
      { noticeDate: noticeDate.value },
      {
        reauthenticate: true,
        responseLabel: (record) =>
          `${TERMINATION_STATE_LABELS[record.state] ?? '終止通知已建立'}，個案識別碼 ${record.terminationId}。`
      }
    );
    if (result && result.terminationId) renderTerminationCase(result);
  });
  terminationLoadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadTermination();
  });
  acknowledgmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!terminationCase) {
      setStatus('請先載入合作個案。', 'error');
      return;
    }
    const kind = receiptKind.value;
    const payload =
      kind === 'data_return'
        ? { receiptKind: kind, exportId: exportId.value }
        : { receiptKind: kind, evidenceRef: evidenceRef.value };
    const result = await runWrite(
      acknowledgmentSubmit,
      `termination-receipt-${terminationCase.terminationId}-${kind}`,
      `/v1/business-delivery/terminations/${encodeURIComponent(terminationCase.terminationId)}/acknowledgements`,
      payload,
      {
        reauthenticate: true,
        responseLabel: (response) => {
          const receipt =
            response.receipt ??
            response.receipts?.find((item) => item.receiptKind === kind) ??
            response;
          return `${TERMINATION_RECEIPT_LABELS[kind]}已記錄；操作者 ${receipt.actorRef ?? '未提供'}，時間 ${receipt.acknowledgedAt ? dateLabel(receipt.acknowledgedAt) : '未提供'}。`;
        }
      }
    );
    if (result)
      await loadTermination(terminationCase.terminationId, {
        preserveStatus: true
      });
  });
  closeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!terminationCase) {
      setStatus('請先載入合作個案。', 'error');
      return;
    }
    const id = terminationCase.terminationId;
    const result = await runWrite(
      closeSubmit,
      `termination-close-${id}`,
      `/v1/business-delivery/terminations/${encodeURIComponent(id)}/close`,
      { expectedVersion: terminationCase.version },
      {
        reauthenticate: true,
        responseLabel: (record) =>
          record.state === 'manual_close_review'
            ? '已提交人工結案審查；未執行服務終止或資料刪除。'
            : (TERMINATION_STATE_LABELS[record.state] ?? '結案狀態已更新。')
      }
    );
    if (!result) {
      const errorText = status.textContent;
      await loadTermination(id, { preserveStatus: true });
      setStatus(errorText, 'error');
    } else {
      await loadTermination(id, { preserveStatus: true });
    }
  });

  const onAccessChange = (event) => {
    if (event.detail?.authorized === true) return;
    disposed = true;
    stopPending();
    root.remove();
    navLink?.remove();
    target.history.replaceState(null, '', '#overview');
  };
  const onHashChange = () => {
    if (target.location.hash !== '#business-section') stopPending();
  };
  const onPageHide = (event) => {
    if (event.persisted) {
      activeController?.abort();
      activeController = undefined;
      return;
    }
    stopPending();
  };
  target.addEventListener(
    'beauessence:workbench-access-change',
    onAccessChange
  );
  target.addEventListener('hashchange', onHashChange);
  target.addEventListener('pagehide', onPageHide, { once: true });
  monthForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadMonth();
  });

  void Promise.all([loadMonth(), loadMilestones(), loadPendingDeletion()]);
  return () => {
    disposed = true;
    stopPending();
    target.removeEventListener(
      'beauessence:workbench-access-change',
      onAccessChange
    );
    target.removeEventListener('hashchange', onHashChange);
    target.removeEventListener('pagehide', onPageHide);
    content.replaceChildren();
    content.hidden = true;
    availability.hidden = false;
    heading.classList.add('visually-hidden');
  };
}
