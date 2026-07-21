const storageKey = 'beauessence_synthetic_online_preview_v1';

function initialState() {
  return {
    policyVersion: 'privacy-v1',
    serviceId: 'service_test_consult',
    slots: [
      { id: 'slot_test_001', startsAt: '2030-01-02T01:00:00Z', endsAt: '2030-01-02T01:30:00Z' },
      { id: 'slot_test_002', startsAt: '2030-01-02T01:30:00Z', endsAt: '2030-01-02T02:00:00Z' }
    ],
    appointments: [],
    workload: [],
    followUp: { status: 'unknown' },
    schedule: {
      timeZone: 'Asia/Taipei',
      weeklyAvailability: [
        { weekday: 1, intervals: [{ startLocalTime: '09:00', endLocalTime: '12:00' }] },
        { weekday: 2, intervals: [{ startLocalTime: '13:00', endLocalTime: '17:00' }] }
      ],
      dateExceptions: []
    },
    auditEvents: [],
    outboxJobs: [],
    sequence: 1,
    workspace: {
      currentRole: 'admin',
      accounts: [
        { id: 'admin_test_001', label: '測試管理者', role: 'admin', status: 'active' },
        { id: 'front_desk_test_001', label: '測試櫃台 A', role: 'front_desk', status: 'active' }
      ],
      accountSequence: 2,
      announcement: {
        status: 'published',
        title: '合成預約服務測試中',
        body: '目前為非正式線上測試版，請勿輸入任何真實資料。',
        updatedAt: '2026-07-21T00:00:00.000Z'
      },
      maintenance: {
        enabled: false,
        title: '預約系統維護中',
        body: '請稍後再回來測試，造成不便敬請見諒。',
        resumeAt: '2030-01-02T12:00'
      },
      releases: [
        { id: 'release_test_001', version: 'preview-1.0', summary: '企業級工作臺與患者預約流程', publishedAt: '2026-07-21T00:00:00.000Z' }
      ]
    }
  };
}

function loadState() {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) return initialState();
    const stored = JSON.parse(value);
    const baseline = initialState();
    return {
      ...baseline,
      ...stored,
      workspace: {
        ...baseline.workspace,
        ...(stored.workspace ?? {})
      }
    };
  } catch {
    return initialState();
  }
}

function saveState(state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
  return structuredClone(state);
}

function requireAdmin(state) {
  if (state.workspace.currentRole !== 'admin') throw new Error('此合成動作只允許管理者角色。');
}

function safeText(value, label, maximum) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) throw new Error(`${label}必須為 1–${maximum} 個字元。`);
  return value.trim();
}

function workspaceTransition(state, path, body) {
  if (path === '/workspace/role') {
    if (body.role !== 'admin' && body.role !== 'front_desk') throw new Error('合成角色無效。');
    state.workspace.currentRole = body.role;
    return;
  }
  requireAdmin(state);
  if (path === '/workspace/accounts') {
    const suffix = String(state.workspace.accountSequence).padStart(3, '0');
    const role = body.role === 'admin' ? 'admin' : 'front_desk';
    state.workspace.accounts.push({ id: `${role}_test_${suffix}`, label: safeText(body.label, '帳號標籤', 24), role, status: 'active' });
    state.workspace.accountSequence += 1;
    return;
  }
  const accountMatch = path.match(/^\/workspace\/accounts\/([A-Za-z0-9_-]+)\/toggle$/);
  if (accountMatch !== null) {
    const account = state.workspace.accounts.find((item) => item.id === accountMatch[1]);
    if (account === undefined) throw new Error('找不到合成帳號。');
    if (account.id === 'admin_test_001' && account.status === 'active') throw new Error('不可停用唯一的預設合成管理者。');
    account.status = account.status === 'active' ? 'disabled' : 'active';
    return;
  }
  if (path === '/workspace/announcement') {
    state.workspace.announcement = {
      status: body.status === 'draft' ? 'draft' : 'published',
      title: safeText(body.title, '公告標題', 40),
      body: safeText(body.body, '公告內容', 160),
      updatedAt: new Date().toISOString()
    };
    return;
  }
  if (path === '/workspace/maintenance') {
    state.workspace.maintenance = {
      enabled: body.enabled === true,
      title: safeText(body.title, '維護標題', 40),
      body: safeText(body.body, '維護說明', 160),
      resumeAt: typeof body.resumeAt === 'string' ? body.resumeAt : ''
    };
    return;
  }
  if (path === '/workspace/releases') {
    const nextId = `release_test_${String(state.workspace.releases.length + 1).padStart(3, '0')}`;
    state.workspace.releases.unshift({
      id: nextId,
      version: safeText(body.version, '版本', 24),
      summary: safeText(body.summary, '發布摘要', 120),
      publishedAt: new Date().toISOString()
    });
    return;
  }
  throw new Error('找不到合成工作臺設定動作。');
}

function validateSchedule(schedule) {
  if (schedule?.timeZone !== 'Asia/Taipei' || !Array.isArray(schedule.weeklyAvailability) || !Array.isArray(schedule.dateExceptions)) throw new Error('合成排班格式無效。');
  const weekdays = new Set();
  for (const entry of schedule.weeklyAvailability) {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6 || weekdays.has(entry.weekday)) throw new Error('星期設定重複或無效。');
    weekdays.add(entry.weekday);
    validateIntervals(entry.intervals);
  }
  const dates = new Set();
  for (const entry of schedule.dateExceptions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || dates.has(entry.date)) throw new Error('日期例外重複或無效。');
    dates.add(entry.date);
    if (entry.kind !== 'closed' && entry.kind !== 'extra_open') throw new Error('日期例外類型無效。');
    if (entry.kind === 'extra_open') validateIntervals(entry.intervals);
  }
}

function validateIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) throw new Error('至少需要一段時間。');
  const sorted = intervals.map((item) => ({ ...item })).sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime));
  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.startLocalTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.endLocalTime) || item.startLocalTime >= item.endLocalTime) throw new Error('開始與結束時間無效。');
    if (index > 0 && sorted[index - 1].endLocalTime > item.startLocalTime) throw new Error('同一天的時段不可重疊。');
  }
}

function reserve(state, slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (slot === undefined || slot.reservationId !== undefined) throw new Error('合成時段已無法預約。');
  const suffix = String(state.sequence).padStart(3, '0');
  const appointmentId = `appointment_test_${suffix}`;
  const now = new Date().toISOString();
  slot.reservationId = appointmentId;
  state.appointments.push({ id: appointmentId, slotId, serviceId: state.serviceId, status: 'confirmed', createdAt: now, updatedAt: now });
  state.auditEvents.push({ id: `audit_${appointmentId}_confirmed`, action: 'appointment_confirmed', appointmentId, actorId: 'actor_test_patient_001', occurredAt: now });
  state.outboxJobs.push({ id: `outbox_${appointmentId}_confirmed`, type: 'calendar_projection_requested', appointmentId, appointmentStatus: 'confirmed', idempotencyKey: `preview_booking_${suffix}` });
  state.sequence += 1;
}

function transitionAppointment(state, appointmentId, action) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (appointment === undefined || appointment.status !== 'confirmed') throw new Error('合成預約狀態無法變更。');
  const now = new Date().toISOString();
  appointment.status = action === 'complete' ? 'completed' : 'cancellation_requested';
  appointment.updatedAt = now;
  const auditAction = action === 'complete' ? 'appointment_completed' : 'cancellation_requested';
  state.auditEvents.push({ id: `audit_${appointmentId}_${auditAction}`, action: auditAction, appointmentId, actorId: action === 'complete' ? 'actor_test_front_desk_001' : 'actor_test_patient_001', occurredAt: now });
  state.outboxJobs.push({ id: `outbox_${appointmentId}_${auditAction}`, type: 'calendar_projection_requested', appointmentId, appointmentStatus: appointment.status, idempotencyKey: `preview_${action}_${appointmentId}` });
  if (action === 'complete' && state.workload.length === 0) state.workload = [{ managerId: 'manager_test_001', payrollPeriod: '2030-01', creditCount: 1, uniquePatientCount: 1, ruleBreakdown: [{ metricCode: 'completed_unique_patient', ruleVersion: 'v1', creditCount: 1, uniquePatientCount: 1 }] }];
}

export async function stagingRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  if (method === 'GET' && path === '/state') return structuredClone(loadState());
  if (method === 'GET' && path === '/workspace') return structuredClone(loadState().workspace);
  if (method !== 'POST') throw new Error('線上合成預覽只允許 GET 與 POST。');
  if (path === '/reset') {
    localStorage.removeItem(storageKey);
    return structuredClone(initialState());
  }
  const state = loadState();
  const body = options.body === undefined ? {} : JSON.parse(options.body);
  if (path.startsWith('/workspace/')) {
    workspaceTransition(state, path, body);
  } else if (path === '/schedule') {
    requireAdmin(state);
    validateSchedule(body);
    state.schedule = body;
  } else if (path === '/follow-up/decision') {
    requireAdmin(state);
    if (body.status !== 'required' && body.status !== 'not_required') throw new Error('回診狀態無效。');
    if (body.status === 'required' && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate ?? '')) throw new Error('需要回診時必須設定目標日期。');
    state.followUp = { status: body.status, ...(body.status === 'required' ? { dueDate: body.dueDate } : {}), decidedBy: 'actor_test_clinic_admin_001', decidedAt: new Date().toISOString() };
  } else if (path === '/bookings') {
    reserve(state, body.slotId);
  } else {
    const match = path.match(/^\/bookings\/([A-Za-z0-9_-]+)\/(cancellation|complete)$/);
    if (match === null) throw new Error('找不到線上合成預覽動作。');
    transitionAppointment(state, match[1], match[2] === 'complete' ? 'complete' : 'cancel');
  }
  return saveState(state);
}
