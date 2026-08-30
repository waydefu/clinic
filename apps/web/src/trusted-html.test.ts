import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assertFirebaseAuthScriptUrl,
  assertRenderable
} from '../public/modules/trusted-html.js';

const calendarPilotEntry = readFileSync(
  fileURLToPath(new URL('./calendar-pilot-entry.js', import.meta.url)),
  'utf8'
);

describe('CAL-PILOT Trusted Types entrypoint', () => {
  it('loads the single audited default policy before Firebase or application code', () => {
    expect(calendarPilotEntry.trimStart()).toMatch(
      /^import '\.\.\/public\/modules\/trusted-html\.js';/
    );
    expect(
      calendarPilotEntry.match(/public\/modules\/trusted-html\.js/g)
    ).toHaveLength(1);
  });

  it('shows a user-facing message when redirect startup fails', () => {
    expect(calendarPilotEntry).toContain(
      'try {\n        await signInWithRedirect'
    );
    expect(calendarPilotEntry).toContain('登入服務暫時無法連線');
  });
});

describe('assertFirebaseAuthScriptUrl', () => {
  it('allows only the Firebase Auth iframe loader callback shape', () => {
    expect(
      assertFirebaseAuthScriptUrl(
        'https://apis.google.com/js/api.js?onload=__iframefcb0'
      )
    ).toBe('https://apis.google.com/js/api.js?onload=__iframefcb0');
    expect(
      assertFirebaseAuthScriptUrl(
        'https://apis.google.com/js/api.js?onload=__iframefcb999999'
      )
    ).toContain('__iframefcb999999');
  });

  it.each([
    'https://evil.example/js/api.js?onload=__iframefcb1',
    'https://apis.google.com/js/other.js?onload=__iframefcb1',
    'https://apis.google.com/js/api.js?onload=alert',
    'https://apis.google.com/js/api.js?onload=__iframefcb1&extra=1',
    'https://apis.google.com/js/api.js?onload=__iframefcb1#fragment',
    ['javascript', ':alert(1)'].join(''),
    'not a URL'
  ])('rejects %s', (url) => {
    expect(() => assertFirebaseAuthScriptUrl(url)).toThrow(TypeError);
  });
});

// Trusted Types 的價值在這裡不是「消毒」——專案的 CSP 禁止外部資源，引入
// DOMPurify 是另一個決定。它做的是結構檢查：把「記得呼叫 escapeHtml」這條紀律
// 變成寫進 DOM 之前一定會跑的一道關卡。
//
// 這組測試釘住的是那道關卡的判準：什麼一定要擋、什麼一定不能誤擋。誤擋比漏擋
// 更危險，因為假警報會讓人把整個檢查關掉。
describe('assertRenderable', () => {
  const executable: ReadonlyArray<[string, string]> = [
    ['script 標籤', '<div><script>alert(1)</script></div>'],
    ['大小寫混寫的 script', '<div><ScRiPt>alert(1)</ScRiPt></div>'],
    ['標籤與名稱間有空白', '<div>< script >alert(1)</div>'],
    ['iframe', '<iframe src="//evil.test"></iframe>'],
    ['object', '<object data="x"></object>'],
    ['embed', '<embed src="x">'],
    ['行內 onerror', '<img src=x onerror="alert(1)">'],
    ['行內 onclick', '<button onclick="steal()">x</button>'],
    ['href 的 javascript: URL', '<a href="javascript:alert(1)">x</a>'],
    ['src 的 javascript: URL', '<iframe src="javascript:alert(1)">']
  ];

  it.each(executable)('rejects %s', (_label, html) => {
    expect(() => assertRenderable(html)).toThrow(TypeError);
  });

  // 這些是實際會渲染的東西的形狀。任何一個被擋下來，畫面就會壞掉。
  const legitimate: ReadonlyArray<[string, string]> = [
    ['一般的資料列', '<tr><td>王小明</td><td>12:00</td></tr>'],
    [
      '帶 data 屬性的按鈕',
      '<button type="button" data-week-event="a_1">x</button>'
    ],
    ['已逸出的角括號', '<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>'],
    ['已逸出的引號與 &', '<td>Tom &amp; Jerry &quot;quoted&quot;</td>'],
    ['option 清單', '<option value="12:00">12:00</option>'],
    ['空字串', '']
  ];

  it.each(legitimate)('allows %s', (_label, html) => {
    expect(() => assertRenderable(html)).not.toThrow();
  });

  // 誤擋的真實風險：備註欄裡的普通文字剛好含有 `on … =` 或 `javascript:` 字樣。
  // 判準要求 `<` 在前，而逸出過的文字不可能產生 `<`，所以這些都必須通過。
  it('does not mistake prose for markup', () => {
    for (const html of [
      '<td>簽到 on = yes</td>',
      '<td>課程主題：javascript: 入門</td>',
      '<td>onsite 服務</td>',
      '<p>患者提到 iframe 這個字</p>'
    ]) {
      expect(() => assertRenderable(html), html).not.toThrow();
    }
  });

  // 真正要抓的迴歸：有人新增 render 函式時忘了 escapeHtml，而值裡帶著標記。
  it('catches an interpolation that skipped escapeHtml', () => {
    const patientName = '<script>fetch("//evil.test")</script>';
    expect(() =>
      assertRenderable(`<td class="patient-name">${patientName}</td>`)
    ).toThrow(/escapeHtml/);
  });
});
