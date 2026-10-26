import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {})
}));
vi.mock('node:fs/promises', () => files);
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
const origin =
  'https://beauessence-clinic-staging--synthetic-review-synthetic.web.app';
const originalExitCode = process.exitCode;
const html =
  'ONLINE PREVIEW 公開預覽，網址持有人皆可存取 id="patient-name" id="patient-phone" id="patient-birth-month" id="patient-birth-day" id="patient-nationality-domestic" 資料只會保存在我這台裝置的瀏覽器 <script src="/app.1234567890.js"></script>';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('PREVIEW_URL', origin);
  vi.stubEnv('GITHUB_SHA', 'a'.repeat(40));
  files.mkdir.mockClear();
  files.writeFile.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function response(url, status = 200) {
  const asset = String(url).endsWith('.js');
  return {
    status,
    url: String(url),
    headers: new Headers({
      'content-security-policy':
        "default-src 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'",
      'cross-origin-opener-policy': 'same-origin-allow-popups',
      'cross-origin-resource-policy': 'same-origin',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex',
      'cache-control': asset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache'
    }),
    text: async () => html
  };
}
function report() {
  return JSON.parse(
    files.writeFile.mock.calls.find(([path]) =>
      path.endsWith('preview-deployment.json')
    )[1]
  );
}
async function started(fetch) {
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled(), {
    timeout: 1000,
    interval: 1
  });
}

describe('preview request deadlines with synthetic HTTP and memory-only evidence', () => {
  it('records each hanging page as failed without retrying it', async () => {
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const completion = import('./verify-preview-deployment.mjs');
    await started(fetch);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(files.writeFile).toHaveBeenCalledTimes(2);
    await completion;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, init]) => init.signal.aborted)).toBe(
      true
    );
    expect(report().conclusion).toBe('failure');
    expect(
      report().checks.filter((check) => check.name.endsWith('fetch completed'))
    ).toHaveLength(2);
    expect(process.exitCode).toBe(1);
  });

  it('bounds HTML response-body consumption as well as fetch', async () => {
    const fetch = vi.fn(async (url) => ({
      ...response(url),
      text: () => new Promise(() => {})
    }));
    vi.stubGlobal('fetch', fetch);
    const completion = import('./verify-preview-deployment.mjs');
    await started(fetch);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(files.writeFile).toHaveBeenCalledTimes(2);
    await completion;
    expect(report().conclusion).toBe('failure');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds the independently fetched asset and keeps failed evidence', async () => {
    const fetch = vi.fn((url) =>
      String(url).endsWith('.js')
        ? new Promise(() => {})
        : Promise.resolve(response(url))
    );
    vi.stubGlobal('fetch', fetch);
    const completion = import('./verify-preview-deployment.mjs');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3), {
      timeout: 1000,
      interval: 1
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await completion;
    expect(report().conclusion).toBe('failure');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][1].signal.aborted).toBe(true);
  });

  it('bounds cancellation of an unused asset body before declaring success', async () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const fetch = vi.fn(async (url) => ({
      ...response(url),
      ...(String(url).endsWith('.js') ? { body: { cancel } } : {})
    }));
    vi.stubGlobal('fetch', fetch);
    const completion = import('./verify-preview-deployment.mjs');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1), {
      timeout: 1000,
      interval: 1
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await completion;
    expect(report().conclusion).toBe('failure');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][1].signal.aborted).toBe(true);
  });

  it('preserves successful HTML, header, marker and immutable asset checks', async () => {
    const fetch = vi.fn(async (url) => response(url));
    vi.stubGlobal('fetch', fetch);
    await import('./verify-preview-deployment.mjs');
    expect(report().conclusion).toBe('success');
    expect(report().checks.every((check) => check.passed)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      fetch.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves HTTP failure evidence without automatic retries', async () => {
    const fetch = vi.fn(async (url) => response(url, 503));
    vi.stubGlobal('fetch', fetch);
    await import('./verify-preview-deployment.mjs');
    expect(report().conclusion).toBe('failure');
    expect(
      report()
        .checks.filter((check) => check.name.endsWith('HTTP 200'))
        .every((check) => !check.passed)
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
