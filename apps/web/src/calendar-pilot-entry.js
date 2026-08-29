import '../public/modules/trusted-html.js';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  TotpMultiFactorGenerator,
  getAuth,
  getMultiFactorResolver,
  getRedirectResult,
  multiFactor,
  signInWithRedirect,
  signOut
} from 'firebase/auth';
import { CALENDAR_PILOT_SCHEDULE, planSlots } from '@beauessence/domain';

const API = '/v1';
let csrfToken;
let auth;
let root;
let statusTimer;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrfToken !== undefined && (options.method ?? 'GET') !== 'GET')
    headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? '目前無法完成操作。');
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

function announce(text, tone = 'info') {
  let node = root.querySelector('.cp-sr-status');
  if (node === null) {
    node = document.createElement('p');
    node.className = 'cp-sr-status';
    node.setAttribute('role', 'status');
    root.append(node);
  }
  node.textContent = text;
  node.dataset.tone = tone;
  node.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    node.hidden = true;
  }, 5000);
}

function idempotency(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

function displayTime(iso) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(iso));
}

function taipeiToday() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function availableAppointmentSlots(availability, bookingKind, expiresAt) {
  const now = Date.now();
  const expiry = Date.parse(expiresAt);
  return planSlots(CALENDAR_PILOT_SCHEDULE, [], {
    startDate: taipeiToday(),
    dayCount: 60
  }).filter((slot) => {
    if (
      slot.kind !== bookingKind ||
      Date.parse(slot.startsAt) <= now ||
      Date.parse(slot.startsAt) >= expiry
    )
      return false;
    const slotEnd = Date.parse(slot.startsAt) + 30 * 60_000;
    return !availability.blocks.some((block) => {
      const sameCapacityLine =
        block.kind === 'busy' ||
        block.bookingKind === null ||
        block.bookingKind === bookingKind;
      return (
        sameCapacityLine &&
        Date.parse(block.startsAt) < slotEnd &&
        Date.parse(block.endsAt) > Date.parse(slot.startsAt)
      );
    });
  });
}

function renderSlotOptions(select, availability, bookingKind, expiresAt) {
  select.replaceChildren();
  const slots = availableAppointmentSlots(availability, bookingKind, expiresAt);
  for (const slot of slots) {
    const option = document.createElement('option');
    option.value = slot.startsAt;
    option.textContent = displayTime(slot.startsAt);
    select.append(option);
  }
  if (slots.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '目前沒有可預約時段';
    select.append(option);
    select.disabled = true;
  } else select.disabled = false;
}

function promptTotp({ enrollmentKey } = {}) {
  return new Promise((resolve) => {
    const region = root.querySelector('[data-otp-region]');
    region.hidden = false;
    region.innerHTML = `
      <div class="cp-otp">
        <h2>${enrollmentKey ? '設定驗證器' : '輸入動態驗證碼'}</h2>
        ${enrollmentKey ? `<p>請在驗證器 App 新增下列金鑰；金鑰只顯示這一次。</p><code class="cp-secret">${escapeHtml(enrollmentKey)}</code>` : ''}
        <form data-otp-form class="cp-form">
          <label class="cp-full">6 位數驗證碼<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required /></label>
          <button class="cp-button cp-button-primary cp-full" type="submit">驗證並繼續</button>
        </form>
      </div>`;
    region.querySelector('[data-otp-form]').addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        const code = new FormData(event.currentTarget).get('code');
        if (!/^[0-9]{6}$/.test(String(code))) return;
        region.hidden = true;
        resolve(String(code));
      },
      { once: true }
    );
  });
}

async function completeGoogleSignIn() {
  let result;
  try {
    result = await getRedirectResult(auth);
  } catch (error) {
    if (error?.code !== 'auth/multi-factor-auth-required') throw error;
    const resolver = getMultiFactorResolver(auth, error);
    const factor = resolver.hints.find(
      (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (factor === undefined)
      throw new Error('此帳號沒有可用的 TOTP 驗證器。', { cause: error });
    const code = await promptTotp();
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(
      factor.uid,
      code
    );
    result = await resolver.resolveSignIn(assertion);
  }
  const user = result?.user ?? auth.currentUser;
  if (user === null) return false;
  const factors = multiFactor(user);
  if (factors.enrolledFactors.length === 0) {
    const secret = await TotpMultiFactorGenerator.generateSecret(
      await factors.getSession()
    );
    const code = await promptTotp({ enrollmentKey: secret.secretKey });
    await factors.enroll(
      TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
      'CAL-PILOT 驗證器'
    );
  }
  const idToken = await user.getIdToken(true);
  const session = await request('/calendar-session', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
  csrfToken = session.csrfToken;
  sessionStorage.setItem('calPilotCsrf', csrfToken);
  return true;
}

function loginView() {
  root.innerHTML = `
    <main class="cp-login" aria-labelledby="cp-login-heading">
      <section class="cp-login-card">
        <img src="/assets/brand-mark.webp" alt="" width="57" height="80" />
        <h1 id="cp-login-heading">CAL-PILOT 安全登入</h1>
        <p>30 天合成日曆測試。僅允許白名單 Google 帳號，並強制使用 TOTP 驗證器。</p>
        <p class="cp-alert">禁止輸入姓名、電話、病歷或任何正式日曆資料。</p>
        <button class="cp-button cp-button-primary" data-google-login type="button">使用 Google 帳號登入</button>
        <p data-login-status role="status" aria-live="polite"></p>
        <div data-otp-region hidden></div>
      </section>
    </main>`;
  root
    .querySelector('[data-google-login]')
    .addEventListener('click', async () => {
      root.querySelector('[data-login-status]').textContent =
        '正在前往 Google 登入…';
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    });
}

function sourceItem(source) {
  const item = document.createElement('li');
  item.className = 'cp-list-item';
  item.innerHTML = `<div class="cp-row"><div><strong></strong><p class="cp-subtle"></p></div><div class="cp-actions"></div></div>`;
  item.querySelector('strong').textContent = source.displayName;
  item.querySelector('p').textContent = source.active
    ? `目前來源・版本 ${source.version}`
    : source.previous
      ? '上一個來源・可驗證後回滾'
      : '備用來源';
  if (!source.active) {
    const button = document.createElement('button');
    button.className = 'cp-button';
    button.textContent = source.previous ? '驗證並回滾' : '驗證並切換';
    button.addEventListener('click', () => switchSource(source, button));
    item.querySelector('.cp-actions').append(button);
  }
  return item;
}

async function waitForPreflight(preflightId) {
  for (let attempt = 0; attempt < 220; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = await request(`/calendar/sources/preflights/${preflightId}`);
    if (result.status !== 'queued') return result;
  }
  throw new Error('日曆驗證仍在排程中，請稍後再試。');
}

async function switchSource(source, button) {
  button.disabled = true;
  try {
    announce('正在驗證日曆讀寫權限與格式…');
    const preflight = await request(
      `/calendar/sources/${source.sourceId}/preflight`,
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idempotency('preflight'),
          expectedVersion: source.version
        })
      }
    );
    const verified = await waitForPreflight(preflight.preflightId);
    if (verified.status !== 'passed') throw new Error('新日曆未通過讀寫驗證。');
    const path = source.previous
      ? '/calendar/sources/rollback'
      : `/calendar/sources/${source.sourceId}/activate`;
    await request(path, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: idempotency(source.previous ? 'rollback' : 'activate'),
        expectedVersion: source.version,
        preflightId: verified.preflightId
      })
    });
    announce(source.previous ? '已回滾到上一個日曆。' : '已切換日曆來源。');
    await renderApplication();
  } catch (error) {
    announce(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function candidateItem(candidate) {
  const item = document.createElement('li');
  item.className = 'cp-list-item cp-event';
  item.dataset.status = candidate.status;
  item.innerHTML = `<div class="cp-row"><div><strong></strong><p class="cp-subtle"></p></div><div class="cp-actions"></div></div>`;
  item.querySelector('strong').textContent = candidate.displayLabel;
  const range =
    candidate.startsAt === null
      ? '格式需修正'
      : `${displayTime(candidate.startsAt)}–${displayTime(candidate.endsAt)}`;
  const before =
    candidate.before === null
      ? ''
      : `・原為 ${candidate.before.displayLabel} ${displayTime(candidate.before.startsAt)}–${displayTime(candidate.before.endsAt)}`;
  item.querySelector('p').textContent = `${candidate.kind}・${range}${before}`;
  const actions = item.querySelector('.cp-actions');
  if (candidate.kind === 'conflict' || candidate.status === 'conflict') {
    for (const [resolution, label] of [
      ['system', '保留系統'],
      ['google', '採用 Google']
    ]) {
      const button = document.createElement('button');
      button.className = 'cp-button';
      button.textContent = label;
      button.addEventListener('click', () =>
        reviewCandidate(candidate, 'resolve', { resolution }, button)
      );
      actions.append(button);
    }
  } else {
    for (const [action, label, primary] of [
      ['accept', '接受', true],
      ['reject', '拒絕', false]
    ]) {
      const button = document.createElement('button');
      button.className = `cp-button${primary ? ' cp-button-primary' : ''}`;
      button.textContent = label;
      button.disabled =
        candidate.kind === 'invalid_format' && action === 'accept';
      button.addEventListener('click', () =>
        reviewCandidate(candidate, action, {}, button)
      );
      actions.append(button);
    }
  }
  return item;
}

async function reviewCandidate(candidate, action, extra, button) {
  button.disabled = true;
  try {
    await request(`/calendar/candidates/${candidate.candidateId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: idempotency(`candidate_${action}`),
        expectedVersion: candidate.expectedVersion,
        ...extra
      })
    });
    announce('候選變更已處理；可用時段已重新檢查。');
    await renderApplication();
  } catch (error) {
    announce(error.message, 'error');
  }
}

function appointmentItem(appointment) {
  const item = document.createElement('li');
  item.className = 'cp-list-item cp-event';
  item.innerHTML = `<div class="cp-row"><div><strong></strong><p class="cp-subtle"></p></div><div class="cp-actions"></div></div>`;
  item.querySelector('strong').textContent =
    `${appointment.patientCode}・${appointment.bookingKind === 'initial' ? '初診' : '回診'}・${appointment.serviceId === 'service_snoring' ? '止鼾' : '醫美'}`;
  item.querySelector('p').textContent =
    `${displayTime(appointment.startsAt)}・${appointment.status === 'confirmed' ? '已成立' : '已取消'}`;
  if (appointment.status === 'confirmed') {
    const reschedule = document.createElement('button');
    reschedule.className = 'cp-button';
    reschedule.textContent = '改期';
    reschedule.addEventListener('click', () => {
      const actions = item.querySelector('.cp-actions');
      if (actions.querySelector('input') !== null) return;
      const input = document.createElement('input');
      input.type = 'datetime-local';
      input.step = '900';
      input.setAttribute('aria-label', '新的日期時間（台北）');
      const confirm = document.createElement('button');
      confirm.className = 'cp-button cp-button-primary';
      confirm.textContent = '確認改期';
      confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        try {
          await request(
            `/calendar/synthetic-appointments/${appointment.appointmentId}/reschedule`,
            {
              method: 'POST',
              body: JSON.stringify({
                idempotencyKey: idempotency('reschedule'),
                expectedVersion: appointment.version,
                startsAt: toUtc(input.value)
              })
            }
          );
          announce('合成預約已改期，Google 更新已排入同步。');
          await renderApplication();
        } catch (error) {
          announce(error.message, 'error');
          confirm.disabled = false;
        }
      });
      actions.append(input, confirm);
      input.focus();
    });
    const cancel = document.createElement('button');
    cancel.className = 'cp-button cp-button-danger';
    cancel.textContent = '取消';
    cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      try {
        await request(
          `/calendar/synthetic-appointments/${appointment.appointmentId}/cancel`,
          {
            method: 'POST',
            body: JSON.stringify({
              idempotencyKey: idempotency('cancel'),
              expectedVersion: appointment.version
            })
          }
        );
        announce('合成預約已取消，Google 刪除已排入同步。');
        await renderApplication();
      } catch (error) {
        announce(error.message, 'error');
      }
    });
    item.querySelector('.cp-actions').append(reschedule, cancel);
  }
  return item;
}

function availabilityItem(block) {
  const item = document.createElement('li');
  item.className = 'cp-list-item cp-event';
  item.dataset.kind = block.kind;
  const strong = document.createElement('strong');
  strong.textContent = block.displayLabel;
  const time = document.createElement('p');
  time.className = 'cp-subtle';
  const kind =
    block.kind === 'busy'
      ? '忙碌・全線'
      : block.bookingKind === 'follow_up'
        ? '預約・回診線'
        : '預約・初診線';
  time.textContent = `${kind}・${displayTime(block.startsAt)}–${displayTime(block.endsAt)}`;
  item.append(strong, time);
  return item;
}

function toUtc(localValue) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue))
    throw new Error('請選擇完整日期與時間。');
  return new Date(`${localValue}:00+08:00`).toISOString();
}

function applicationSkeleton(isPatient) {
  root.innerHTML = `
    <div class="cp-shell">
      <header class="cp-topbar">
        <div class="cp-brand"><img src="/assets/brand-mark.webp" alt="" /><div><strong>一森渼診所</strong><span>CAL-PILOT 30 天合成同步</span></div></div>
        <div class="cp-actions"><span class="cp-badge">SYNTHETIC ONLY</span><button class="cp-button" data-logout>登出</button></div>
      </header>
      <main class="cp-grid" id="cp-main">
        <section class="cp-card"><div class="cp-row"><div><h1>${isPatient ? '合成患者預約測試' : '日曆同步工作臺'}</h1><p>Google 與網頁共用同一份可用時段；外部變更必須審核後才會占用。</p></div><p class="cp-alert">不得輸入真實資料</p></div><div class="cp-status" data-status-grid></div></section>
        ${isPatient ? '' : '<section class="cp-card cp-two"><h2>日曆來源</h2><p>切換前會驗證讀寫與格式；失敗時維持舊來源。</p><ul class="cp-list" data-sources></ul></section><section class="cp-card cp-two"><h2>待審佇列</h2><p>預約、忙碌、修改、刪除與衝突均不自動覆蓋。</p><ul class="cp-list" data-candidates></ul></section>'}
        <section class="cp-card cp-two"><h2>建立合成預約</h2><form class="cp-form" data-appointment-form><label>合成患者<select name="patientCode" required></select></label><label>掛號別<select name="bookingKind"><option value="initial">初診</option><option value="follow_up">回診</option></select></label><label>項目<select name="serviceId"><option value="service_snoring">止鼾</option><option value="service_aesthetic">醫美</option></select></label><label>可用時段（台北）<select name="startsAt" required></select></label><button class="cp-button cp-button-primary cp-full" type="submit">建立並排入 Google 同步</button></form></section>
        <section class="cp-card cp-two"><h2>合成預約</h2><ul class="cp-list" data-appointments></ul></section>
        <section class="cp-card"><h2>共用時段鏡像</h2><p>文字標籤同時區分預約與忙碌，不只依靠顏色。</p><ul class="cp-list" data-availability></ul></section>
      </main>
    </div>`;
}

function empty(list, text) {
  const item = document.createElement('li');
  item.className = 'cp-empty';
  item.textContent = text;
  list.append(item);
}

async function renderApplication() {
  const isPatient =
    location.pathname === '/booking' ||
    location.pathname.endsWith('/patient.html');
  applicationSkeleton(isPatient);
  root.querySelector('[data-logout]').addEventListener('click', async () => {
    await request('/calendar-session', { method: 'DELETE' }).catch(
      () => undefined
    );
    await signOut(auth);
    sessionStorage.removeItem('calPilotCsrf');
    location.reload();
  });
  const [sync, sources, candidates, availability, appointments, patients] =
    await Promise.all([
      request('/calendar/status'),
      isPatient ? Promise.resolve([]) : request('/calendar/sources'),
      isPatient ? Promise.resolve([]) : request('/calendar/candidates'),
      request('/calendar/availability'),
      request('/calendar/synthetic-appointments'),
      request('/calendar/synthetic-patients')
    ]);
  const metrics = [
    ['同步狀態', sync.health],
    ['待審', String(sync.pendingCandidateCount)],
    ['衝突', String(sync.conflictCount)],
    ['測試到期', displayTime(sync.expiresAt)]
  ];
  const statusGrid = root.querySelector('[data-status-grid]');
  for (const [label, value] of metrics) {
    const metric = document.createElement('div');
    metric.className = 'cp-metric';
    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    const valueNode = document.createElement('strong');
    valueNode.textContent = value;
    metric.append(labelNode, valueNode);
    statusGrid.append(metric);
  }
  if (!isPatient) {
    const sourceList = root.querySelector('[data-sources]');
    for (const source of sources) sourceList.append(sourceItem(source));
    if (sources.length === 0) empty(sourceList, '尚未設定白名單來源。');
    const candidateList = root.querySelector('[data-candidates]');
    for (const candidate of candidates)
      candidateList.append(candidateItem(candidate));
    if (candidates.length === 0) empty(candidateList, '目前沒有待審變更。');
  }
  const appointmentList = root.querySelector('[data-appointments]');
  for (const appointment of appointments)
    appointmentList.append(appointmentItem(appointment));
  if (appointments.length === 0) empty(appointmentList, '尚未建立合成預約。');
  const availabilityList = root.querySelector('[data-availability]');
  for (const block of availability.blocks)
    availabilityList.append(availabilityItem(block));
  if (availability.blocks.length === 0)
    empty(availabilityList, '目前沒有已核准的占用時段。');
  const patientSelect = root.querySelector('[name="patientCode"]');
  for (const patient of patients) {
    const option = document.createElement('option');
    option.value = patient.patientCode;
    option.textContent = patient.patientCode;
    patientSelect.append(option);
  }
  const appointmentForm = root.querySelector('[data-appointment-form]');
  const bookingKindSelect = appointmentForm.querySelector(
    '[name="bookingKind"]'
  );
  const startsAtSelect = appointmentForm.querySelector('[name="startsAt"]');
  const refreshSlots = () =>
    renderSlotOptions(
      startsAtSelect,
      availability,
      bookingKindSelect.value,
      sync.expiresAt
    );
  bookingKindSelect.addEventListener('change', refreshSlots);
  refreshSlots();
  root
    .querySelector('[data-appointment-form]')
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button');
      button.disabled = true;
      try {
        const form = Object.fromEntries(new FormData(event.currentTarget));
        await request('/calendar/synthetic-appointments', {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: idempotency('appointment'),
            expectedVersion: 0,
            patientCode: form.patientCode,
            bookingKind: form.bookingKind,
            serviceId: form.serviceId,
            startsAt: form.startsAt
          })
        });
        announce('合成預約已建立；Google 回寫已排入 Worker。');
        await renderApplication();
      } catch (error) {
        announce(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
}

async function boot() {
  const configResponse = await fetch(`${API}/calendar-session/client-config`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).catch(() => undefined);
  if (configResponse?.ok !== true) return;
  const config = await configResponse.json();
  document.documentElement.classList.add('calendar-pilot-active');
  root = document.createElement('div');
  root.className = 'calendar-pilot-root';
  document.body.append(root);
  auth = getAuth(initializeApp(config, 'calendar-pilot'));
  loginView();
  const cachedCsrf = sessionStorage.getItem('calPilotCsrf');
  if (cachedCsrf !== null) {
    csrfToken = cachedCsrf;
    try {
      await renderApplication();
      return;
    } catch {
      sessionStorage.removeItem('calPilotCsrf');
      csrfToken = undefined;
    }
  }
  try {
    if (await completeGoogleSignIn()) await renderApplication();
  } catch (error) {
    const node = root.querySelector('[data-login-status]');
    if (node !== null)
      node.textContent = error.message ?? '登入失敗，請重新嘗試。';
  }
}

void boot();
