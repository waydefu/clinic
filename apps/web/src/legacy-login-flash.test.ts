import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webPublic = join(dirname(fileURLToPath(import.meta.url)), '../public');

function readPublic(name) {
  return readFileSync(join(webPublic, name), 'utf8');
}

describe('legacy synthetic login first paint', () => {
  it('loads CAL-PILOT boot CSS in <head> before the synthetic login markup', () => {
    const html = readPublic('index.html');
    const headEnd = html.indexOf('</head>');
    const loginMarkup = html.indexOf('id="login-view"');
    const cssInHead = html.lastIndexOf('calendar-pilot.css', headEnd);
    expect(headEnd).toBeGreaterThan(0);
    expect(loginMarkup).toBeGreaterThan(headEnd);
    expect(cssInHead).toBeGreaterThan(0);
    expect(cssInHead).toBeLessThan(headEnd);
  });

  it('hides the synthetic gate until CAL-PILOT takes over or the loader marks the workbench ready', () => {
    const css = readPublic('calendar-pilot.css');
    expect(css).toContain('synthetic-workbench-ready');
    expect(css).toContain('calendar-pilot-active');
    expect(css).toMatch(/#login-view/);
    expect(css).toContain('cp-boot-status');
  });
});
