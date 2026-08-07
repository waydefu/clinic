// 把根字級調成 200%，看內容有沒有被切掉。
//
// **這是自動化 proxy，不是人工驗收。** SC 1.4.4 要的是「透過使用者代理提供的
// 文字縮放機制放大到 200% 而不損失內容或功能」——W3C **並未指定**一定要用
// text-only zoom，而瀏覽器的文字縮放設定本身也只有真人操作得了。這裡改的是
// `html { font-size }`，它逼出同一類版面壓力，但不等於實機驗收。
//
// 分兩層，因為**只看文件層的水平溢位證明不了沒有裁切**：一個
// `height: 24px; overflow: hidden` 的元件，文字放大後下半截整個消失，
// `document.scrollWidth <= clientWidth` 依然是綠的。W3C 的失敗案例 F69 明列
// clipped／truncated／obscured 都算損失內容。
export const CLIP_SCAN = `(() => {
  const EPSILON = 1;

  const ownText = (element) => [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => (node.textContent ?? '').trim())
    .join('');

  const decorative = (element) => {
    if (element.closest('[aria-hidden="true"]') !== null) return true;
    if (element.closest('.visually-hidden') !== null) return true;
    if (element.closest('svg') !== null) return true;
    return false;
  };

  // 具名 allowlist：設計上允許截斷，且完整文字另有取得管道的元件。
  // **不是整類略過**——要放行哪一個就寫哪一個，並附理由。
  const ALLOWED = [
    // 目前為空。要加請寫清楚完整文字從哪裡取得。
  ];
  const allowed = (element) => ALLOWED.some((selector) => element.matches(selector));

  const describe = (element) => element.tagName.toLowerCase() +
    (element.id !== '' ? '#' + element.id : '') +
    (element.className !== '' ? '.' + String(element.className).trim().split(/\\s+/).join('.') : '');

  // 可見框＝padding box：getBoundingClientRect 含邊框，clientWidth/Height 不含，
  // 所以要先扣掉邊框才對得起來。
  const visibleBox = (node, style) => {
    const rect = node.getBoundingClientRect();
    const left = rect.left + Number.parseFloat(style.borderLeftWidth || '0');
    const top = rect.top + Number.parseFloat(style.borderTopWidth || '0');
    return {
      left,
      top,
      right: left + node.clientWidth,
      bottom: top + node.clientHeight
    };
  };

  const offenders = [];
  const seen = new Set();
  for (const element of document.querySelectorAll('body *')) {
    const text = ownText(element);
    if (text === '') continue;
    if (decorative(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    // **問的是「這段文字有沒有跑到可見框外」，不是「容器的 scroll 範圍有沒有
    // 超過 client 範圍」。** 後者會被裝飾誤觸：/clinic 的 hero 用偽元素畫裝飾
    // 形狀，在 200% 下 scrollWidth 1325 > clientWidth 1280，但沒有任何文字被切
    // ——那正是 hero 上 overflow-x: hidden 存在的目的。以容器的 scroll 範圍
    // 判定會把它報成缺陷，然後逼人加 allowlist 去掩蓋一個假陽性。
    //
    // 裁切可能來自文字元素自己，也可能來自**祖先**（固定高度加 overflow:hidden
    // 的容器包著一個 p），所以要往上走。
    for (let node = element; node !== null && node !== document.body; node = node.parentElement) {
      if (allowed(node)) break;
      const style = window.getComputedStyle(node);
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (!clipsY && !clipsX) continue;

      const visible = visibleBox(node, style);
      const cutBottom = clipsY && box.bottom > visible.bottom + EPSILON;
      const cutTop = clipsY && box.top < visible.top - EPSILON;
      const cutRight = clipsX && box.right > visible.right + EPSILON;
      const cutLeft = clipsX && box.left < visible.left - EPSILON;
      if (!cutBottom && !cutTop && !cutRight && !cutLeft) continue;

      const axis = cutBottom || cutTop
        ? '垂直：文字 ' + Math.round(box.top) + '–' + Math.round(box.bottom) +
          '，可見 ' + Math.round(visible.top) + '–' + Math.round(visible.bottom)
        : '水平：文字 ' + Math.round(box.left) + '–' + Math.round(box.right) +
          '，可見 ' + Math.round(visible.left) + '–' + Math.round(visible.right);
      const key = describe(element) + '|' + describe(node) + '|' + axis;
      if (seen.has(key)) break;
      seen.add(key);
      offenders.push(
        describe(element) + ' 「' + text.slice(0, 20) + '」被 ' +
        describe(node) + ' 切掉（' + axis + '）'
      );
      break;
    }
  }
  return offenders;
})()`;
