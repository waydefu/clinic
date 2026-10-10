import {
  CALENDAR_PILOT_AUTH_OUTCOME,
  clearCalendarPilotClientAuthState,
  calendarPilotAuthenticationGeneration,
  verifyCalendarPilotClientSession,
  isCalendarPilotLogoutInProgress
} from '../public/modules/pilot-google-totp-session.js';

function isPublicBookingPath(pathname = '') {
  return pathname === '/booking' || pathname.endsWith('/patient.html');
}

function wantsCalendarPilotOverlay(search = '') {
  return new URLSearchParams(String(search)).get('calendarPilot') === '1';
}

function failPendingReauthentication() {
  if (sessionStorage.getItem('calPilotCsrf') !== null) {
    window.__beauessenceReauthBridgeReady = false;
    window.__beauessenceReauthBridgeFailed = true;
    window.dispatchEvent(new Event('beauessence:reauth-bridge-failed'));
  }
}

/**
 * CAL-PILOT 開機順序：先確認伺服器設定，再由伺服器 /me 驗證身分，驗證通過才交給
 * 工作臺或 Calendar 介面；登出進行中或驗證世代改變時一律停手。
 *
 * Firebase SDK 與畫面操作由入口檔透過 ops 注入：initializeAuth(config) 回傳 auth、
 * mountRoot()、setCsrfToken(value)、registerReauthBridge()、bootStatusView(message)、
 * showLogin(message)、renderApplication()、handoffToStaffWorkbench()、
 * awaitFirstAuthState(auth)、completeGoogleSignIn()。
 */
export async function bootCalendarPilot(ops) {
  const bootGeneration = calendarPilotAuthenticationGeneration();
  if (isPublicBookingPath(location.pathname)) {
    document.documentElement.classList.add('synthetic-workbench-ready');
    return;
  }
  if (isCalendarPilotLogoutInProgress(sessionStorage)) {
    failPendingReauthentication();
    document.documentElement.classList.add('synthetic-workbench-ready');
    return;
  }
  const configResponse = await fetch('/v1/calendar-session/client-config', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).catch(() => undefined);
  if (configResponse?.ok !== true) {
    failPendingReauthentication();
    document.documentElement.classList.add('synthetic-workbench-ready');
    return;
  }
  if (
    bootGeneration !== calendarPilotAuthenticationGeneration() ||
    isCalendarPilotLogoutInProgress(sessionStorage)
  )
    return;
  const config = await configResponse.json();
  const calendarPilotWorkbench = wantsCalendarPilotOverlay(location.search);
  document.documentElement.classList.add('calendar-pilot-active');
  ops.mountRoot();
  const auth = ops.initializeAuth(config);
  ops.registerReauthBridge();
  window.__beauessenceReauthBridgeFailed = false;
  window.__beauessenceReauthBridgeReady = true;
  window.dispatchEvent(new Event('beauessence:reauth-bridge-ready'));
  ops.bootStatusView('正在完成登入…');
  const cachedCsrf = sessionStorage.getItem('calPilotCsrf');
  if (cachedCsrf !== null) {
    ops.setCsrfToken(cachedCsrf);
    try {
      const verified = await verifyCalendarPilotClientSession(
        auth.currentUser?.uid
      );
      if (!verified) {
        ops.setCsrfToken(undefined);
        if (!isCalendarPilotLogoutInProgress(sessionStorage))
          ops.showLogin('工作階段無法驗證，請重新登入。');
        return;
      }
      if (bootGeneration !== calendarPilotAuthenticationGeneration()) return;
      if (calendarPilotWorkbench) {
        await ops.renderApplication();
        return;
      }
      await ops.handoffToStaffWorkbench();
      return;
    } catch {
      clearCalendarPilotClientAuthState(sessionStorage);
      ops.setCsrfToken(undefined);
      // renderApplication replaced the login DOM before its request failed.
      // Restore the OTP region before processing a pending MFA redirect.
      ops.bootStatusView('正在完成登入…');
    }
  }
  try {
    await ops.awaitFirstAuthState(auth);
  } catch {
    failPendingReauthentication();
    document.documentElement.classList.add('synthetic-workbench-ready');
    return;
  }
  try {
    const result = await ops.completeGoogleSignIn();
    if (result.outcome === CALENDAR_PILOT_AUTH_OUTCOME.AUTHENTICATED) {
      ops.setCsrfToken(result.csrfToken);
      const verified = await verifyCalendarPilotClientSession(
        auth.currentUser?.uid
      );
      if (!verified) {
        ops.setCsrfToken(undefined);
        if (!isCalendarPilotLogoutInProgress(sessionStorage))
          ops.showLogin('工作階段無法驗證，請重新登入。');
        return;
      }
      if (isCalendarPilotLogoutInProgress(sessionStorage)) return;
      if (calendarPilotWorkbench) {
        await ops.renderApplication();
        return;
      }
      await ops.handoffToStaffWorkbench();
      location.reload();
      return;
    }
    if (result.outcome === CALENDAR_PILOT_AUTH_OUTCOME.NEEDS_REAUTHENTICATION) {
      ops.setCsrfToken(undefined);
      ops.showLogin(result.message);
      return;
    }
  } catch (error) {
    ops.setCsrfToken(undefined);
    ops.showLogin(error.message ?? '登入失敗，請重新嘗試。');
    return;
  }
  ops.showLogin();
}
