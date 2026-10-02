const BRIDGE_READY_EVENT = 'beauessence:reauth-bridge-ready';
const BRIDGE_FAILED_EVENT = 'beauessence:reauth-bridge-failed';
const BRIDGE_TIMEOUT_MS = 30_000;

let preparation;

function waitForBridge(target) {
  if (target.__beauessenceReauthBridgeReady === true) return Promise.resolve();
  if (target.__beauessenceReauthBridgeFailed === true)
    return Promise.reject(new Error('重新登入功能目前無法使用'));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      target.removeEventListener(BRIDGE_READY_EVENT, onReady);
      target.removeEventListener(BRIDGE_FAILED_EVENT, onFailure);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onFailure = () => {
      cleanup();
      reject(new Error('重新登入功能目前無法使用'));
    };
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('重新登入功能載入逾時'));
    }, BRIDGE_TIMEOUT_MS);
    target.addEventListener(BRIDGE_READY_EVENT, onReady, { once: true });
    target.addEventListener(BRIDGE_FAILED_EVENT, onFailure, { once: true });
  });
}

function loadStylesheet(documentRef) {
  if (documentRef.querySelector('link[data-business-reauth-style]'))
    return Promise.resolve();

  const stylesheet = documentRef.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '../calendar-pilot.css';
  stylesheet.dataset.businessReauthStyle = '';
  return new Promise((resolve, reject) => {
    stylesheet.addEventListener('load', resolve, { once: true });
    stylesheet.addEventListener(
      'error',
      () => {
        stylesheet.remove();
        reject(new Error('重新登入樣式目前無法載入'));
      },
      { once: true }
    );
    documentRef.head.append(stylesheet);
  });
}

/** Loads Google + TOTP only after a manager opens the Business tab. */
export function prepareBusinessReauthentication({
  target = globalThis.window,
  documentRef = globalThis.document
} = {}) {
  if (preparation) return preparation;
  preparation = (async () => {
    await loadStylesheet(documentRef);
    const ready = waitForBridge(target);
    await import('../calendar-pilot-client.js');
    await ready;
  })().catch((error) => {
    preparation = undefined;
    throw new Error('Google + TOTP 重新登入目前無法載入', { cause: error });
  });
  return preparation;
}
