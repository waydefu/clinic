import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webPublic = join(dirname(fileURLToPath(import.meta.url)), '../public');

function readPublic(name) {
  return readFileSync(join(webPublic, name), 'utf8');
}

describe('legacy synthetic login first paint', () => {
  it('does not eager-load calendar-pilot.css in <head>', () => {
    const html = readPublic('index.html');
    const headEnd = html.indexOf('</head>');
    const loginMarkup = html.indexOf('id="login-view"');
    const cssInHead = html.lastIndexOf('calendar-pilot.css', headEnd);
    expect(headEnd).toBeGreaterThan(0);
    expect(loginMarkup).toBeGreaterThan(headEnd);
    expect(cssInHead).toBe(-1);
  });

  it('hides the synthetic gate from workbench.css until CAL-PILOT takes over or the loader marks the workbench ready', () => {
    const css = readPublic('workbench.css');
    expect(css).toContain('synthetic-workbench-ready');
    expect(css).toContain('calendar-pilot-active');
    expect(css).toMatch(/#login-view/);
    expect(css).toContain('cp-boot-status');
  });

  it('exposes a boot status before the synthetic login markup', () => {
    const html = readPublic('index.html');
    const boot = html.indexOf('id="cal-pilot-boot-status"');
    const loginMarkup = html.indexOf('id="login-view"');
    expect(boot).toBeGreaterThan(0);
    expect(boot).toBeLessThan(loginMarkup);
    expect(html).toContain('正在載入安全登入');
  });
});
