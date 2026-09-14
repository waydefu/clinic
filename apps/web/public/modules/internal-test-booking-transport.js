function storedReturnSession() {
  return globalThis.sessionStorage?.getItem('itrs') ?? undefined;
}

function rememberReturnSession(sessionId) {
  if (typeof sessionId === 'string' && sessionId !== '')
    globalThis.sessionStorage?.setItem('itrs', sessionId);
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

export function mapInternalTestBookingRequest(path, method, body = {}) {
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
        ...(body.intake !== undefined && body.intake !== null
          ? { intake: body.intake }
          : {}),
        ...(body.intake === undefined &&
        typeof body.onBehalfPatientId === 'string'
          ? { onBehalfPatientId: body.onBehalfPatientId }
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
        ...(decision === 'required'
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
    ...(decision === 'required'
      ? {
          dueDate: typeof body?.dueDate === 'string' ? body.dueDate : undefined,
          dueTime: typeof body?.dueTime === 'string' ? body.dueTime : undefined
        }
      : {})
  };
  const followUps = Array.isArray(state.followUps) ? state.followUps : [];
  const existing = followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  if (existing === undefined) followUps.push(next);
  else {
    Object.assign(existing, next);
    if (decision === 'not_required') {
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

async function requestV1(
  fetchImpl,
  mapped,
  { signal, csrfToken, accessToken, toError }
) {
  const headers = {
    Accept: 'application/json'
  };
  if (mapped.body !== undefined) headers['Content-Type'] = 'application/json';
  if (typeof csrfToken === 'string' && csrfToken !== '') {
    headers['X-CSRF-Token'] = csrfToken;
  }
  if (typeof accessToken === 'string' && accessToken !== '') {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const session = storedReturnSession();
  if (typeof session === 'string') headers['x-return-session'] = session;
  const response = await fetchImpl(mapped.url, {
    method: mapped.method,
    headers,
    credentials: 'same-origin',
    signal,
    ...(mapped.body === undefined ? {} : { body: JSON.stringify(mapped.body) })
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
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
  return payload;
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
  csrfToken = () =>
    globalThis.sessionStorage?.getItem('calPilotCsrf') ?? undefined,
  accessToken = () =>
    globalThis.sessionStorage?.getItem('internalTestIdToken') ?? undefined
} = {}) {
  if (typeof local !== 'function')
    throw new TypeError('local transport is required.');
  if (typeof toError !== 'function')
    throw new TypeError('toError mapper is required.');

  const v1 = (mapped) =>
    requestV1(fetchImpl, mapped, {
      signal: undefined,
      csrfToken: csrfToken(),
      accessToken: accessToken(),
      toError
    });

  return async function internalTestBookingTransport(path, options = {}) {
    const mapped = mapInternalTestBookingRequest(
      path,
      options.method,
      parseBody(options)
    );
    if (mapped === undefined) {
      if (
        String(options.method ?? 'GET').toUpperCase() === 'POST' &&
        (/^\/bookings\/[A-Za-z0-9_-]+\/(complete-without-card|notes)$/.test(
          path
        ) ||
          path === '/case-assignments' ||
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
      try {
        const next = overlayListedSlots(
          localResult,
          await v1({ url: '/v1/slots', method: 'GET' })
        );
        const published = await v1({
          url: '/v1/schedule',
          method: 'GET'
        }).catch(() => undefined);
        const listed = await v1({
          url: '/v1/bookings',
          method: 'GET'
        }).catch(() => ({ appointments: [] }));
        const withSchedule =
          published === undefined
            ? next
            : overlayPublishedSchedule(next, published);
        return {
          ...withSchedule,
          appointments: (listed?.appointments ?? []).map((item) => ({
            id: item.appointmentId,
            slotId: item.slotId ?? item.appointmentId,
            startsAt: item.startsAt,
            patientId: item.patientId,
            bookingKind: item.bookingKind,
            status: item.status
          }))
        };
      } catch {
        return { ...localResult, slots: [], appointments: [] };
      }
    }
    const payload = await requestV1(fetchImpl, mapped, {
      signal: options.signal,
      csrfToken: csrfToken(),
      accessToken: accessToken(),
      toError
    });
    rememberReturnSession(payload?.sessionId);
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
