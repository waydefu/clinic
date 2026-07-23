import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// firebase.json 是靜態託管的安全邊界來源：CSP、frame、referrer 等 header 都在
// 這裡定義，卻不會被一般單元測試執行到。這支測試把「應有哪些指令」釘住，讓任何
// 放寬（例如不小心拿掉 object-src 或允許 inline script）在 CI 就被擋下。
const firebaseConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../firebase.json', import.meta.url)),
    'utf8'
  )
);

function headerValue(key: string): string {
  const rule = firebaseConfig.hosting.headers.find(
    (entry: { source: string }) => entry.source === '**'
  );
  const header = rule?.headers.find(
    (item: { key: string }) => item.key.toLowerCase() === key.toLowerCase()
  );
  if (!header) throw new Error(`Missing "${key}" header on the "**" source.`);
  return header.value;
}

describe('hosting security headers', () => {
  it('locks the Content-Security-Policy directives', () => {
    const directives = new Set(
      headerValue('Content-Security-Policy')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
    );

    for (const directive of [
      "default-src 'self'",
      "connect-src 'self'",
      "style-src 'self'",
      "script-src 'self'",
      // 沒有任何 <object>/<embed>/<applet> 插件面：關掉外掛執行面。
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ]) {
      expect(directives).toContain(directive);
    }
  });

  it('never allows inline or remote script/style execution', () => {
    const csp = headerValue('Content-Security-Policy');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('*');
  });

  it('keeps the framing, sniffing and referrer protections', () => {
    expect(headerValue('X-Frame-Options')).toBe('DENY');
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('Referrer-Policy')).toBe('no-referrer');
    expect(headerValue('X-Robots-Tag')).toContain('noindex');
  });
});
