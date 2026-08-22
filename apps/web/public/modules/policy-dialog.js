// 在預約表單裡就地展開隱私權政策全文。
//
// 為什麼用「按需取回」而不是把全文寫進 patient.html：
//
//   1. **不能有兩份。** 全文的權威版本是 /privacy（它要有固定網址才能被官網
//      連結、收藏、列印、標版本號）。把同一段文字再抄一份進預約頁，兩邊遲早
//      不一致——而不一致的法律文件比沒有更糟。
//   2. **不該讓每個人都付這個成本。** 政策全文約 3 KiB，但真正點開來看的是
//      少數；預約頁的 document 預算是 8 KiB，把全文塞進去會直接撞穿，而那是
//      每一位患者、每一次載入都要付的。
//
// 取回的是同源的靜態頁面，不是外部服務、也不送出任何資料。CSP 的
// `connect-src 'self'` 允許這一條，且失敗時會退回「另開 /privacy」的連結，
// 不會讓人卡在一個空的視窗裡。

let dialog;
let bodyNode;
let fallbackNode;
let closeButton;
let cached;

function ensureDialog() {
  if (dialog !== undefined) return;

  dialog = document.createElement('dialog');
  dialog.className = 'policy-dialog';
  dialog.setAttribute('aria-labelledby', 'policy-dialog-title');

  const heading = document.createElement('h2');
  heading.id = 'policy-dialog-title';
  heading.className = 'policy-dialog-title';
  heading.textContent = '隱私權政策與個人資料蒐集告知草稿';

  bodyNode = document.createElement('div');
  bodyNode.className = 'policy-dialog-body';
  // 長文要能捲動，而可捲動的區塊必須能被鍵盤聚焦後捲動（WCAG 2.1.1）。
  bodyNode.tabIndex = 0;
  bodyNode.setAttribute('role', 'document');

  fallbackNode = document.createElement('p');
  fallbackNode.className = 'policy-dialog-fallback';
  fallbackNode.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'policy-dialog-actions';
  closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'button button-secondary';
  closeButton.textContent = '關閉';
  closeButton.addEventListener('click', () => dialog.close());
  actions.append(closeButton);

  dialog.append(heading, bodyNode, fallbackNode, actions);
  document.body.append(dialog);
}

/** 只取政策頁的主要內容，捨棄它自己的頁首頁尾——那些在彈窗裡是重複的。 */
function extractPolicyBody(html) {
  // DOMParser 產生的是一份**不會執行指令碼、不會載入資源**的離線文件，
  // 因此不需要 innerHTML，也就不會碰到 Trusted Types 的接收點。
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main');
  if (main === null) return undefined;
  // 彈窗自己有標題，內文的 h1 拿掉避免重複報讀。
  main.querySelector('h1')?.remove();
  return document.importNode(main, true);
}

export async function openPolicyDialog() {
  ensureDialog();
  fallbackNode.hidden = true;
  dialog.showModal();
  closeButton.focus();

  if (cached === undefined) {
    bodyNode.replaceChildren(
      Object.assign(document.createElement('p'), { textContent: '載入中…' })
    );
    try {
      const response = await fetch('/privacy', {
        headers: { accept: 'text/html' }
      });
      if (!response.ok) throw new Error(String(response.status));
      cached = extractPolicyBody(await response.text());
      if (cached === undefined) throw new Error('no main');
    } catch {
      cached = undefined;
      bodyNode.replaceChildren();
      // 退路要是「看得到全文」，不是一句抱歉。
      fallbackNode.replaceChildren(
        document.createTextNode('目前無法在此顯示全文，請改開 '),
        Object.assign(document.createElement('a'), {
          href: '/privacy',
          textContent: '隱私權政策頁',
          target: '_blank',
          rel: 'noopener'
        }),
        document.createTextNode('。')
      );
      fallbackNode.hidden = false;
      return;
    }
  }
  bodyNode.replaceChildren(cached.cloneNode(true));
  bodyNode.scrollTop = 0;
}
