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
        ...(typeof body.onBehalfPatientId === 'string'
          ? { onBehalfPatientId: body.onBehalfPatientId }
          : {})
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
  const noShow = /^\/bookings\/([A-Za-z0-9_-]+)\/no-show$/.exec(path);
  if (verb === 'POST' && noShow !== null) {
    return {
      url: `/v1/bookings/${noShow[1]}/no-show`,
      method: 'POST',
      body: { idempotencyKey: idempotencyKey() }
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
  return undefined;
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
 * Slot list and schedule publish join that gate. `/state` stays local, then
 * overlays the published grid when the operator opted in. A failed grid
 * fetch must not leave the local synthetic slots bookable.
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
      const localResult = await local(path, options);
      if (
        path === '/state' &&
        String(options.method ?? 'GET').toUpperCase() === 'GET'
      ) {
        try {
          let next = overlayListedSlots(
            localResult,
            await v1({ url: '/v1/slots', method: 'GET' })
          );
          try {
            next = overlayPublishedSchedule(
              next,
              await v1({ url: '/v1/schedule', method: 'GET' })
            );
          } catch {
            return next;
          }
          return next;
        } catch {
          return { ...localResult, slots: [] };
        }
      }
      return localResult;
    }
    const payload = await requestV1(fetchImpl, mapped, {
      signal: options.signal,
      csrfToken: csrfToken(),
      accessToken: accessToken(),
      toError
    });
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
