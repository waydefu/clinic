async function clearCalendarPilotClientAuthState(storage) {
  const session = await import('./pilot-google-totp-session.js');
  session.clearCalendarPilotClientAuthState(storage);
}
import { DEFAULT_BLOCKED_TIMES } from './constants.js';
import { validateSchedule } from './schedule-engine.js';
import { CALENDAR_PILOT_SCHEDULE } from '../vendor/domain/calendar-sync.js';

const STAGE_F_SCHEDULE_IDEMPOTENCY = 'stagef_c1_schedule_publish_v0';
const STAGE_F_HOST_PATTERN = /^beauessence-clinic-stg-c1a01\.web\.app$/i;

export function isStageFM11Enabled(location = globalThis.location) {
  if (location === undefined || location === null) return false;
  if (String(location.protocol ?? '') !== 'https:') return false;
  if (String(location.pathname ?? '') !== '/staff') return false;
  if (!STAGE_F_HOST_PATTERN.test(String(location.hostname ?? ''))) return false;
  const query = new URLSearchParams(String(location.search ?? ''));
  return (
    query.get('internalTestBooking') === '1' && query.get('stageFM11') === '1'
  );
}

function stageFM11Schedule() {
  return {
    ...CALENDAR_PILOT_SCHEDULE,
    blockedTimes: {
      initial: [...DEFAULT_BLOCKED_TIMES.initial],
      follow_up: [...DEFAULT_BLOCKED_TIMES.follow_up]
    }
  };
}

let returnContextGeneration = 0;

export function clearInternalTestReturnSession() {
  returnContextGeneration += 1;
  globalThis.sessionStorage?.removeItem('itrs');
}

function publicBookingLocation() {
  const path = String(globalThis.location?.pathname ?? '');
  return path === '/booking' || path.endsWith('/patient.html');
}

function storedReturnSession() {
  return globalThis.sessionStorage?.getItem('itrs') ?? undefined;
}

function rememberReturnSession(sessionId) {
  if (typeof sessionId === 'string' && sessionId !== '')
    globalThis.sessionStorage?.setItem('itrs', sessionId);
}

function returnSessionForRequest(mapped) {
  if (!publicBookingLocation()) return undefined;
  const patientRead =
    mapped.method === 'GET' &&
    /^\/v1\/bookings(?:\/[A-Za-z0-9_-]+|\?cursor=[A-Za-z0-9_-]+)?$/.test(
      mapped.url
    );
  const patientWrite =
    mapped.method === 'POST' &&
    /^\/v1\/bookings\/[A-Za-z0-9_-]+\/(cancel|reschedule)$/.test(mapped.url);
  const returnBooking =
    mapped.url === '/v1/bookings' &&
    mapped.method === 'POST' &&
    mapped.body?.bookingKind === 'follow_up' &&
    mapped.body?.intake === undefined;
  return patientRead || patientWrite || returnBooking
    ? storedReturnSession()
    : undefined;
}

function overlayListedSlots(state, listed) {
  const listedSlots = Array.isArray(listed?.slots) ? listed.slots : [];
  return {
    ...state,
    slots: listedSlots.map((slot) => ({
      id: slot.slotId,
      kind: slot.kind,
      startsAt: slot.startsAt,
      ...(slot.available === true ? {} : { reservationId: 'reserved' })
    }))
  };
}

/**
 * Re-apply published occupancy onto the in-memory snapshot after a contract
 * write. A failed list must not leave the pre-write grid bookable.
 */
export async function refreshPublishedOccupancy(request, currentState) {
  try {
    return overlayListedSlots(currentState, await request('/slots'));
  } catch {
    return { ...currentState, slots: [] };
  }
}

function overlayPublishedSchedule(state, published) {
  if (typeof published?.publishedVersion !== 'number') return state;
  const next = {
    ...state,
    scheduleMeta: {
      ...state.scheduleMeta,
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt,
      draftDirty: state.scheduleMeta?.draftDirty === true
    }
  };
  if (published.schedule !== null && published.schedule !== undefined) {
    validateSchedule(published.schedule);
    next.schedule = published.schedule;
    if (state.scheduleMeta?.draftDirty !== true) {
      next.scheduleDraft = published.schedule;
    }
  }
  return next;
}

function parseBody(options) {
  if (typeof options.body !== 'string') return {};
  try {
    const parsed = JSON.parse(options.body);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function idempotencyKey() {
  return `idem_${crypto.randomUUID().replaceAll('-', '')}`;
}

function firstServiceId(body) {
  if (typeof body.serviceId === 'string') return body.serviceId;
  if (Array.isArray(body.itemIds) && typeof body.itemIds[0] === 'string') {
    return body.itemIds[0];
  }
  return undefined;
}

// 工作台代建新病患：不能把瀏覽器本機產生的 id 當 onBehalfPatientId 送出
// （伺服器的 patients 沒有那筆）。改送 intake，由伺服器建立或對應病患並回傳 id。
// 櫃台人員在現場收件即視為已告知隱私聲明（待負責人確認，見 PR 說明）。
function staffIntake(body) {
  if (body.intake !== undefined && body.intake !== null)
    return { intake: body.intake };
  const patient = body.patient;
  if (body.origin !== 'staff' || patient === undefined || patient === null)
    return undefined;
  if (typeof patient !== 'object') return undefined;
  return {
    intake: {
      name: patient.name,
      phone: patient.phone,
      birthDate: patient.birthDate,
      nationality: patient.nationality,
      privacyConsent: true
    }
  };
}

export function mapInternalTestBookingRequest(
  path,
  method,
  body = {},
  location = globalThis.location
) {
  const verb = String(method ?? 'GET').toUpperCase();
  if (verb === 'POST' && path === '/bookings') {
    return {
      url: '/v1/bookings',
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        slotId: body.slotId,
        serviceId: firstServiceId(body),
        bookingKind: body.bookingKind,
        ...(staffIntake(body) ?? {}),
        ...(body.intake === undefined &&
        staffIntake(body) === undefined &&
        typeof body.onBehalfPatientId === 'string'
          ? { onBehalfPatientId: body.onBehalfPatientId }
          : {}),
        ...(typeof body.patientNote === 'string' &&
        body.patientNote.trim() !== ''
          ? { patientNote: body.patientNote.trim() }
          : {})
      }
    };
  }
  if (verb === 'POST' && path === '/patient/bookings/lookup') {
    if (typeof body.phone !== 'string' || typeof body.birthDate !== 'string') {
      return undefined;
    }
    return {
      url: '/v1/return-lookup',
      method: 'POST',
      body: {
        phone: body.phone,
        birthDate: body.birthDate
      }
    };
  }
  const cancel =
    /^\/patient\/bookings\/([A-Za-z0-9_-]+)\/self-cancel$/.exec(path) ??
    /^\/bookings\/([A-Za-z0-9_-]+)\/cancel$/.exec(path);
  if (verb === 'POST' && cancel !== null) {
    return {
      url: `/v1/bookings/${cancel[1]}/cancel`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
    };
  }
  const reschedule =
    /^\/patient\/bookings\/([A-Za-z0-9_-]+)\/self-reschedule$/.exec(path) ??
    /^\/bookings\/([A-Za-z0-9_-]+)\/reschedule$/.exec(path);
  if (verb === 'POST' && reschedule !== null) {
    const targetSlotId =
      typeof body.targetSlotId === 'string' ? body.targetSlotId : body.slotId;
    return {
      url: `/v1/bookings/${reschedule[1]}/reschedule`,
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        targetSlotId
      }
    };
  }
  const complete = /^\/bookings\/([A-Za-z0-9_-]+)\/complete$/.exec(path);
  if (verb === 'POST' && complete !== null) {
    return {
      url: `/v1/bookings/${complete[1]}/complete`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
    };
  }
  const noCard = /^\/bookings\/([A-Za-z0-9_-]+)\/complete-without-card$/.exec(
    path
  );
  if (verb === 'POST' && noCard !== null) {
    return {
      url: `/v1/bookings/${noCard[1]}/complete-without-card`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
    };
  }
  const arrive = /^\/bookings\/([A-Za-z0-9_-]+)\/arrive$/.exec(path);
  if (verb === 'POST' && arrive !== null) {
    return {
      url: `/v1/bookings/${arrive[1]}/arrive`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
    };
  }
  const noShow = /^\/bookings\/([A-Za-z0-9_-]+)\/no-show$/.exec(path);
  if (verb === 'POST' && noShow !== null) {
    return {
      url: `/v1/bookings/${noShow[1]}/no-show`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
    };
  }
  const notes = /^\/bookings\/([A-Za-z0-9_-]+)\/notes$/.exec(path);
  if (verb === 'POST' && notes !== null) {
    return {
      url: `/v1/bookings/${notes[1]}/notes`,
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        noteTags: [...new Set(body.noteTags ?? [])],
        noteText: String(body.noteText ?? '').trim()
      }
    };
  }
  const deletion = /^\/bookings\/([A-Za-z0-9_-]+)\/delete$/.exec(path);
  if (verb === 'POST' && deletion !== null) {
    return {
      url: `/v1/bookings/${deletion[1]}/delete`,
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        reasonCode: body.reasonCode
      }
    };
  }
  const query = /^\/bookings\/([A-Za-z0-9_-]+)$/.exec(path);
  if (verb === 'GET' && query !== null) {
    return { url: `/v1/bookings/${query[1]}`, method: 'GET' };
  }
  if (verb === 'GET' && path === '/slots') {
    const kind =
      typeof body.kind === 'string' && body.kind !== ''
        ? `?kind=${encodeURIComponent(body.kind)}`
        : '';
    return { url: `/v1/slots${kind}`, method: 'GET' };
  }
  if (verb === 'GET' && path === '/schedule') {
    return { url: '/v1/schedule', method: 'GET' };
  }
  if (verb === 'POST' && path === '/schedule/publish') {
    if (isStageFM11Enabled(location)) {
      return {
        url: '/v1/schedule/publish',
        method: 'POST',
        body: {
          idempotencyKey: STAGE_F_SCHEDULE_IDEMPOTENCY,
          expectedVersion: 0,
          schedule: stageFM11Schedule()
        }
      };
    }
    return {
      url: '/v1/schedule/publish',
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        expectedVersion: body.expectedVersion,
        schedule: body.schedule
      }
    };
  }
  const followUp = /^\/follow-ups\/([A-Za-z0-9_-]+)$/.exec(path);
  if (verb === 'POST' && followUp !== null) {
    const decision =
      typeof body.decision === 'string' ? body.decision : body.status;
    return {
      url: `/v1/bookings/${followUp[1]}/follow-up`,
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        decision,
        ...(decision === 'required' &&
        typeof body.dueDate === 'string' &&
        body.dueDate !== '' &&
        typeof body.dueTime === 'string' &&
        body.dueTime !== ''
          ? { dueDate: body.dueDate, dueTime: body.dueTime }
          : {})
      }
    };
  }
  return undefined;
}

export function applyFollowUpContractWrite(state, path, body, result) {
  const followUp = /^\/follow-ups\/([^/]+)$/.exec(path);
  if (followUp === null) return state;
  const decision = result?.decision;
  if (decision !== 'required' && decision !== 'not_required') return state;
  const appointmentId = followUp[1];
  const appointment = Array.isArray(state?.appointments)
    ? state.appointments.find((item) => item.id === appointmentId)
    : undefined;
  const now = new Date().toISOString();
  const next = {
    appointmentId,
    ...(appointment === undefined ? {} : { patientId: appointment.patientId }),
    status: decision,
    followUpDecisionBy: 'doctor_instruction',
    decidedAt: now,
    followUpRecordedAt: now,
    ...(decision === 'required' &&
    typeof body?.dueDate === 'string' &&
    body.dueDate !== '' &&
    typeof body?.dueTime === 'string' &&
    body.dueTime !== ''
      ? { dueDate: body.dueDate, dueTime: body.dueTime }
      : {})
  };
  const followUps = Array.isArray(state.followUps) ? state.followUps : [];
  const existing = followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  if (existing === undefined) followUps.push(next);
  else {
    Object.assign(existing, next);
    if (decision === 'not_required' || next.dueDate === undefined) {
      delete existing.dueDate;
      delete existing.dueTime;
    }
  }
  state.followUps = followUps;
  return state;
}

export function applyDeleteContractWrite(state, path, result) {
  const deletion = /^\/bookings\/([^/]+)\/delete$/.exec(path);
  if (deletion === null || result?.deleted !== true) return state;
  const appointmentId = deletion[1];
  if (Array.isArray(state?.appointments)) {
    state.appointments = state.appointments.filter(
      (item) => item.id !== appointmentId
    );
  }
  return state;
}

const RECOVERABLE_BOOKING_TRANSITION =
  /^\/bookings\/([A-Za-z0-9_-]+)\/(cancel|arrive|complete|no-show|reschedule)$/;

function isOccupancyWritePath(path) {
  return (
    path === '/bookings' ||
    /\/bookings\/.+\/(cancel|reschedule|no-show|delete)$/.test(path)
  );
}

function isRetryableServiceUnavailable(error) {
  return (
    error !== null &&
    typeof error === 'object' &&
    error.name === 'ApiClientError' &&
    error.code === 'SERVICE_UNAVAILABLE' &&
    error.retryable === true
  );
}

function matchesRecoveredBookingTransition(
  action,
  body,
  latest,
  previousAppointment
) {
  if (latest === null || typeof latest !== 'object') return false;
  switch (action) {
    case 'cancel':
      return latest.status === 'cancelled';
    case 'arrive':
      return latest.status === 'arrived';
    case 'complete':
      return latest.status === 'completed';
    case 'no-show':
      return latest.status === 'no_show';
    case 'reschedule': {
      if (latest.status !== 'confirmed') return false;
      const targetSlotId =
        typeof body?.targetSlotId === 'string'
          ? body.targetSlotId
          : body?.slotId;
      if (
        typeof targetSlotId === 'string' &&
        typeof latest.slotId === 'string'
      ) {
        return latest.slotId === targetSlotId;
      }
      return (
        typeof latest.startsAt === 'string' &&
        typeof previousAppointment?.startsAt === 'string' &&
        latest.startsAt !== previousAppointment.startsAt
      );
    }
    default:
      return false;
  }
}

async function recoverBookingTransitionAfterUnavailable({
  path,
  body,
  state,
  request,
  error
}) {
  if (!isRetryableServiceUnavailable(error)) return undefined;
  const match = RECOVERABLE_BOOKING_TRANSITION.exec(path);
  if (match === null) return undefined;
  const [, appointmentId, action] = match;
  const previousAppointment = Array.isArray(state?.appointments)
    ? state.appointments.find((item) => item.id === appointmentId)
    : undefined;
  try {
    const latest = await request(`/bookings/${appointmentId}`);
    if (
      latest?.appointmentId === appointmentId &&
      matchesRecoveredBookingTransition(
        action,
        body,
        latest,
        previousAppointment
      )
    ) {
      return latest;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Executes a staff write against `/v1` with two resilience boundaries:
 * 1. If a known booking transition fails with a retryable SERVICE_UNAVAILABLE
 *    (such as a cold-start timeout after the server committed), read back
 *    `GET /bookings/:id` once and converge if the target state is persisted.
 * 2. Once the primary write is applied locally, secondary occupancy refresh
 *    failures degrade without losing the applied booking state or skipping
 *    the caller's render hook.
 */
export async function commitInternalTestBookingWrite({
  path,
  body = {},
  state,
  request,
  applyContractWrite,
  refreshOccupancy = refreshPublishedOccupancy,
  onCommitted
}) {
  let result;
  try {
    result = await request(path, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  } catch (error) {
    const recovered = await recoverBookingTransitionAfterUnavailable({
      path,
      body,
      state,
      request,
      error
    });
    if (recovered === undefined) throw error;
    result = recovered;
  }

  if (Array.isArray(result?.appointments)) {
    onCommitted?.(result);
    return result;
  }
  if (path === '/schedule/publish') {
    const refreshed = await request('/state');
    onCommitted?.(refreshed);
    return refreshed;
  }

  let nextState = state;
  let applied = false;
  try {
    applyContractWrite?.(path, body, result);
    applied = true;
    if (typeof result?.appointmentId === 'string') {
      if (isOccupancyWritePath(path)) {
        applyDeleteContractWrite(nextState, path, result);
        try {
          nextState = await refreshOccupancy(
            (nextPath) => request(nextPath),
            nextState
          );
        } catch {
          nextState = { ...nextState, slots: [] };
        }
      } else if (/^\/follow-ups\/[A-Za-z0-9_-]+$/.test(path)) {
        applyFollowUpContractWrite(nextState, path, body, result);
      }
    }
    return nextState;
  } finally {
    if (applied) onCommitted?.(nextState);
  }
}

async function requestV1(
  fetchImpl,
  mapped,
  {
    signal,
    csrfToken,
    accessToken,
    toError,
    credentials,
    returnSession,
    onResponse
  }
) {
  const generation = calendarPilotAuthenticationGeneration();
  const isPublic = publicBookingLocation();
  const headers = {
    Accept: 'application/json'
  };
  if (mapped.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!isPublic && typeof csrfToken === 'string' && csrfToken !== '') {
    headers['X-CSRF-Token'] = csrfToken;
  }
  if (!isPublic && typeof accessToken === 'string' && accessToken !== '') {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (typeof returnSession === 'string' && returnSession !== '') {
    headers['x-return-session'] = returnSession;
  }
  const response = await fetchImpl(mapped.url, {
    method: mapped.method,
    headers,
    credentials: isPublic ? 'omit' : (credentials ?? 'same-origin'),
    signal,
    ...(mapped.body === undefined ? {} : { body: JSON.stringify(mapped.body) })
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (
      !isPublic &&
      generation === calendarPilotAuthenticationGeneration() &&
      (response.status === 401 || payload?.error?.code === 'ACCOUNT_DISABLED')
    ) {
      await clearCalendarPilotClientAuthState(globalThis.sessionStorage);
    }
    const error =
      payload !== null && typeof payload === 'object'
        ? payload.error
        : undefined;
    throw toError({
      status: response.status,
      code: typeof error?.code === 'string' ? error.code : undefined,
      correlationId:
        typeof error?.correlationId === 'string'
          ? error.correlationId
          : undefined,
      message: typeof error?.message === 'string' ? error.message : undefined
    });
  }
  onResponse?.(response);
  return payload;
}

// Five pages of 50 bound what one workbench load costs. If the server still has
// more after that, the list says so (appointmentsTruncated) instead of passing
// the loaded rows off as everything.
const MAX_BOOKING_PAGES = 5;

async function listBookingPages(v1) {
  const appointments = [];
  let cursor;
  for (let page = 0; page < MAX_BOOKING_PAGES; page += 1) {
    let next;
    const body = await v1(
      {
        url:
          cursor === undefined
            ? '/v1/bookings'
            : `/v1/bookings?cursor=${encodeURIComponent(cursor)}`,
        method: 'GET'
      },
      (response) => {
        const header = response?.headers?.get?.('x-next-cursor');
        if (typeof header === 'string' && header !== '') next = header;
      }
    );
    appointments.push(...(body?.appointments ?? []));
    if (next === undefined) return { appointments, truncated: false };
    cursor = next;
  }
  return { appointments, truncated: true };
}

/**
 * Hybrid transport: booking writes/query go to fail-closed `/v1/bookings`.
 * Slot list and schedule publish join that gate. `/state` keeps local UI
 * chrome, then overlays published occupancy and server appointment rows.
 * Local appointment lists are not the source of truth in this mode.
 */
export function createInternalTestBookingTransport({
  local,
  toError,
  fetchImpl = globalThis.fetch.bind(globalThis),
  credentials,
  csrfToken,
  accessToken
} = {}) {
  if (typeof local !== 'function')
    throw new TypeError('local transport is required.');
  if (typeof toError !== 'function')
    throw new TypeError('toError mapper is required.');
  const publicBooking = publicBookingLocation();
  if (!publicBooking) clearInternalTestReturnSession();
  const resolvedCredentials =
    credentials ?? (publicBooking ? 'omit' : 'same-origin');
  const resolvedCsrf =
    csrfToken ??
    (() =>
      publicBooking
        ? undefined
        : (globalThis.sessionStorage?.getItem('calPilotCsrf') ?? undefined));
  globalThis.sessionStorage?.removeItem('internalTestIdToken');
  const resolvedAccess = accessToken ?? (() => undefined);
  const v1 = async (mapped, onResponse) => {
    const isPublic = publicBookingLocation();
    return requestV1(fetchImpl, mapped, {
      signal: undefined,
      csrfToken: isPublic ? undefined : resolvedCsrf(),
      accessToken: isPublic ? undefined : resolvedAccess(),
      toError,
      credentials: isPublic ? 'omit' : resolvedCredentials,
      returnSession: returnSessionForRequest(mapped),
      onResponse
    });
  };

  return async function internalTestBookingTransport(path, options = {}) {
    const body = parseBody(options);
    const isPost = String(options.method ?? 'GET').toUpperCase() === 'POST';
    const isReturnLookup = isPost && path === '/patient/bookings/lookup';
    const isNewIntake =
      isPost &&
      path === '/bookings' &&
      (body.bookingKind === 'initial' || body.intake !== undefined);
    if (isReturnLookup || isNewIntake) clearInternalTestReturnSession();
    const lookupGeneration = returnContextGeneration;
    const mapped = mapInternalTestBookingRequest(
      path,
      options.method,
      body,
      globalThis.location
    );
    if (mapped === undefined) {
      if (
        String(options.method ?? 'GET').toUpperCase() === 'POST' &&
        (path === '/case-assignments' ||
          path === '/outbox/simulate' ||
          path === '/outbox/requeue')
      ) {
        throw toError({
          status: 503,
          code: 'SERVICE_UNAVAILABLE'
        });
      }
      const localResult = await local(path, options);
      const overlay =
        (path === '/state' &&
          String(options.method ?? 'GET').toUpperCase() === 'GET') ||
        (Array.isArray(localResult?.appointments) &&
          Array.isArray(localResult?.slots));
      if (!overlay) return localResult;
      const next = overlayListedSlots(
        localResult,
        await v1({ url: '/v1/slots', method: 'GET' })
      );
      const published = await v1({
        url: '/v1/schedule',
        method: 'GET'
      });
      // 公開預約頁且沒有回診 session：匿名病患本來就不能列預約（API 回 401），不呼叫。
      // 員工頁與已回診查詢的公開頁維持原樣，失敗照常往上拋。
      const listed =
        publicBookingLocation() && storedReturnSession() === undefined
          ? { appointments: [], truncated: false }
          : await listBookingPages(v1);
      const withSchedule =
        published === undefined
          ? next
          : overlayPublishedSchedule(next, published);
      // 員工清單隨預約帶回患者全名與手機（STAFF-LIST-PATIENT-DISPLAY-2026-11-23）。
      const listedPatients = new Map();
      for (const item of listed.appointments) {
        if (item.patient !== undefined && item.patientId !== undefined)
          listedPatients.set(item.patientId, {
            id: item.patientId,
            name: item.patient.name,
            phone: item.patient.phone
          });
      }
      return {
        ...withSchedule,
        ...(listedPatients.size > 0
          ? { patients: [...listedPatients.values()] }
          : {}),
        ...(listed.truncated ? { appointmentsTruncated: true } : {}),
        appointments: listed.appointments.map((item) => ({
          id: item.appointmentId,
          slotId: item.slotId ?? item.appointmentId,
          startsAt: item.startsAt,
          patientId: item.patientId,
          bookingKind: item.bookingKind,
          status: item.status,
          intakeNationality: item.intakeNationality,
          ...(item.identityReviewRequired === true
            ? { identityReviewRequired: true }
            : {}),
          // 患者在預約表單自填的備註（BOOKING-NOTE-STORAGE-2026-09-29）：
          // 伺服器只在櫃台清單回傳；這裡不帶，工作臺就永遠看不到它。
          ...(typeof item.patientNote === 'string' && item.patientNote !== ''
            ? { patientNote: item.patientNote }
            : {}),
          // 櫃台營運備註（STAFF-NOTE-2026-11-28）：同樣只在櫃台清單回傳。
          ...(Array.isArray(item.noteTags) ? { noteTags: item.noteTags } : {}),
          ...(item.nhiCardMissing === true ? { nhiCardMissing: true } : {}),
          ...(typeof item.noteText === 'string'
            ? { noteText: item.noteText }
            : {})
        }))
      };
    }
    const payload = await requestV1(fetchImpl, mapped, {
      signal: options.signal,
      csrfToken: resolvedCsrf(),
      accessToken: resolvedAccess(),
      toError,
      credentials: resolvedCredentials,
      returnSession: returnSessionForRequest(mapped)
    });
    if (isReturnLookup) {
      if (
        lookupGeneration !== returnContextGeneration ||
        !publicBookingLocation()
      ) {
        throw new DOMException('Booking context changed.', 'AbortError');
      }
      rememberReturnSession(payload?.sessionId);
    }
    if (path === '/schedule/publish' && payload !== undefined) {
      try {
        payload.slots = (await v1({ url: '/v1/slots', method: 'GET' })).slots;
      } catch {
        payload.slots = [];
        return payload;
      }
    }
    return payload;
  };
}
