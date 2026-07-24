import { ApiClientError, asApiClientError } from './api-client.js';

/**
 * Runs one UI action at a time, exposing both visual and accessibility state.
 * Retry is returned only for errors explicitly marked retryable by the client.
 */
export async function runPendingAction({
  control,
  pendingLabel = '處理中…',
  action
}) {
  if (control?.dataset.busy === 'true') {
    return {
      ok: false,
      error: new ApiClientError('這項操作仍在處理中。', {
        code: 'REQUEST_ALREADY_PENDING'
      })
    };
  }

  const originalLabel = control?.textContent;
  if (control !== undefined) {
    control.disabled = true;
    control.dataset.busy = 'true';
    control.setAttribute('aria-busy', 'true');
    control.textContent = pendingLabel;
  }

  try {
    return { ok: true, value: await action() };
  } catch (error) {
    const clientError = asApiClientError(error);
    return {
      ok: false,
      error: clientError,
      ...(clientError.retryable
        ? {
            retry: () => runPendingAction({ control, pendingLabel, action })
          }
        : {})
    };
  } finally {
    if (control !== undefined) {
      control.disabled = false;
      delete control.dataset.busy;
      control.removeAttribute('aria-busy');
      control.textContent = originalLabel;
    }
  }
}
