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

export function mapInternalTestBookingRequest(path, method, body) {
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
    return {
      url: `/v1/bookings/${reschedule[1]}/reschedule`,
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        targetSlotId: body.targetSlotId
      }
    };
  }
  const query = /^\/bookings\/([A-Za-z0-9_-]+)$/.exec(path);
  if (verb === 'GET' && query !== null) {
    return { url: `/v1/bookings/${query[1]}`, method: 'GET' };
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
 * Everything else, including `/state` and phone lookup, stays on the injected
 * local store so preview pages without the opt-in keep working.
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

  return async function internalTestBookingTransport(path, options = {}) {
    const mapped = mapInternalTestBookingRequest(
      path,
      options.method,
      parseBody(options)
    );
    if (mapped === undefined) return local(path, options);
    return requestV1(fetchImpl, mapped, {
      signal: options.signal,
      csrfToken: csrfToken(),
      accessToken: accessToken(),
      toError
    });
  };
}
