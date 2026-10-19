import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootStaffWorkbench } from '../public/modules/workspace-tabs.js';

const localMessage = '工作臺已就緒。資料只保存在這台裝置的瀏覽器。';
const apiMessage =
  '工作臺已就緒。預約資料以內部測試服務為準，部分介面資料仍保存在這台裝置的瀏覽器。';

function harness({
  apiMode = false,
  authenticated = true,
  denied = false
} = {}) {
  vi.stubGlobal('sessionStorage', { getItem: () => null });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal('window', {
    location: { hash: '' },
    addEventListener: vi.fn()
  });
  let state = { session: { authenticated } };
  const request = vi.fn().mockResolvedValue(state);
  const workbench = {
    getState: () => state,
    setState: vi.fn((next: typeof state) => {
      state = next;
    }),
    setClient: vi.fn(),
    loadStaffServerAuthority: vi.fn(),
    resolveApiClient: () => Promise.resolve({ request }),
    isInternalTestBookingEnabled: () => apiMode,
    enforceRoleDomBoundary: vi.fn(),
    render: vi.fn(),
    initWorkspaceTabs: vi.fn(({ onDenied }: { onDenied: () => void }) => {
      if (denied) onDenied();
    }),
    message: vi.fn(),
    elements: {
      status: { setAttribute: vi.fn(), focus: vi.fn() },
      'login-account': { focus: vi.fn() }
    }
  };
  return { workbench, request, boot: () => bootStaffWorkbench(workbench) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workbench start copy follows the selected transport without widening access', () => {
  it.each([
    { apiMode: false, message: localMessage },
    { apiMode: true, message: apiMessage }
  ])(
    'describes the actual data boundary in API mode=$apiMode',
    async (mode) => {
      const h = harness(mode);
      await h.boot();
      expect(h.request).toHaveBeenCalledWith('/state');
      expect(h.workbench.message).toHaveBeenCalledWith(mode.message, 'success');
      expect(h.workbench.enforceRoleDomBoundary).toHaveBeenCalledOnce();
      expect(h.workbench.loadStaffServerAuthority).not.toHaveBeenCalled();
    }
  );

  it('does not turn a failed state load into a successful start', async () => {
    const h = harness({ apiMode: true });
    h.request.mockRejectedValue(
      Object.assign(new Error('工作臺載入失敗。'), { status: 503 })
    );
    await h.boot();
    expect(h.workbench.message).toHaveBeenCalledWith(
      '工作臺載入失敗。',
      'error'
    );
    expect(h.workbench.message).not.toHaveBeenCalledWith(
      expect.any(String),
      'success'
    );
    expect(h.workbench.setState).not.toHaveBeenCalled();
  });

  it('does not announce readiness for an unauthenticated session', async () => {
    const h = harness({ apiMode: true, authenticated: false });
    await h.boot();
    expect(h.workbench.message).not.toHaveBeenCalledWith(
      expect.any(String),
      'success'
    );
    expect(h.workbench.elements['login-account'].focus).toHaveBeenCalledOnce();
  });

  it('preserves the denied-panel error instead of replacing it with success', async () => {
    const h = harness({ apiMode: true, denied: true });
    await h.boot();
    expect(h.workbench.message).toHaveBeenCalledWith(
      '你目前沒有權限開啟這個主管工作區，已返回營運首頁。',
      'error'
    );
    expect(h.workbench.message).not.toHaveBeenCalledWith(
      expect.any(String),
      'success'
    );
    expect(h.workbench.elements.status.focus).toHaveBeenCalledOnce();
  });
});
