/**
 * 在受測頁面裡執行的收集函式（經 page.evaluate 序列化送進瀏覽器）。只讀不寫，
 * 不依賴頁面自己的程式；回傳純資料給 Node 端的指標函式。
 *
 * 每次只收「目前視窗內」的東西：score.mjs 會捲到每一格畫面再呼叫一次，讓 DOM
 * 量測與同一時刻的截圖對得上（固定或黏著的 header 因此在每一格都會被算到，
 * 這正是使用者實際看到的樣子）。
 */

/** 收集目前視窗內的內容矩形、文字區塊、互動目標與主要行動按鈕。 */
export function collectFrame() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const CJK =
    /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
  const parseColour = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  };
  // 只給報讀器的文字（visually-hidden：裁成 1px、clip 掉）畫面上看不到，不能算進對比、
  // 字級或版面。2026-10-12 首屏社群圖示裡的隱藏名稱疊在品牌色上，曾被誤算成對比不足。
  const clippedAway = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (
      (r.width <= 1 && r.height <= 1) ||
      s.clip === 'rect(0px, 0px, 0px, 0px)' ||
      s.clipPath === 'inset(50%)'
    );
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    return (
      s.visibility !== 'hidden' &&
      s.display !== 'none' &&
      Number(s.opacity) > 0.05 &&
      !clippedAway(el)
    );
  };
  const inView = (r) =>
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.top < vh &&
    r.right > 0 &&
    r.left < vw;
  const toRect = (r) => ({
    left: Math.max(0, r.left),
    top: Math.max(0, r.top),
    right: Math.min(vw, r.right),
    bottom: Math.min(vh, r.bottom)
  });
  const effectiveBackground = (el) => {
    for (
      let node = el;
      node && node.nodeType === 1;
      node = node.parentElement
    ) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColour(s.backgroundColor);
      if (c && c.a >= 0.95) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const textBlocks = [];
  const textRects = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.replace(/\s+/g, '');
    if (!text) continue;
    const host = node.parentElement;
    if (
      !host ||
      !visible(host) ||
      host.closest('script,style,noscript,[aria-hidden="true"]')
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter(inView);
    if (lines.length === 0) continue;
    for (const line of lines) textRects.push(toRect(line));
    // 以最近的區塊層元素當「文字區塊」（段落、標題、清單項目）。
    let block = host;
    while (
      block.parentElement &&
      getComputedStyle(block).display.startsWith('inline')
    )
      block = block.parentElement;
    if (seen.has(block)) continue;
    seen.add(block);
    const s = getComputedStyle(block);
    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);
    const lineRects = [...blockRange.getClientRects()].filter(
      (r) => r.width > 1
    );
    const tops = new Set(lineRects.map((r) => Math.round(r.top)));
    const fullText = block.textContent.replace(/\s+/g, '');
    const fontSize = parseFloat(s.fontSize);
    // 'normal' 的實際行高取決於字型（中文系統字常在 1.3 上下），所以量第一個行框的
    // 高度，不用固定倍數猜；同時記下它是不是根本沒設定行高。
    const lineHeight =
      s.lineHeight === 'normal'
        ? (lineRects[0]?.height ?? fontSize * 1.2)
        : parseFloat(s.lineHeight);
    textBlocks.push({
      rect: toRect(block.getBoundingClientRect()),
      chars: fullText.length,
      cjkChars: (fullText.match(CJK) ?? []).length,
      lines: tops.size,
      fontSize,
      lineHeight,
      lineHeightNormal: s.lineHeight === 'normal',
      fontWeight: Number(s.fontWeight) || 400,
      color: parseColour(s.color),
      background: effectiveBackground(block),
      tag: block.tagName.toLowerCase()
    });
  }

  const mediaRects = [];
  for (const el of document.querySelectorAll(
    'img,svg,video,canvas,picture,iframe'
  )) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (inView(r) && visible(el) && r.width * r.height > 64)
      mediaRects.push(toRect(r));
  }
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (!s.backgroundImage.includes('url(')) continue;
    const r = el.getBoundingClientRect();
    if (inView(r) && visible(el)) mediaRects.push(toRect(r));
  }

  const targets = [];
  const controls = [];
  for (const el of document.querySelectorAll(
    'a[href],button,input,select,textarea,[role="button"]'
  )) {
    const r = el.getBoundingClientRect();
    if (!inView(r) || !visible(el)) continue;
    targets.push({ width: r.width, height: r.height });
    const s = getComputedStyle(el);
    const bg = parseColour(s.backgroundColor);
    if ((bg && bg.a > 0.5) || parseFloat(s.borderTopWidth) > 0)
      controls.push(toRect(r));
  }

  // 主要行動：視窗內有實心底色、面積最大的連結或按鈕；找不到就用文字比對。
  let cta = null;
  let best = 0;
  const pageBg = effectiveBackground(document.body);
  for (const el of document.querySelectorAll('a[href],button')) {
    const r = el.getBoundingClientRect();
    if (!inView(r) || !visible(el) || r.height < 20) continue;
    const bg = parseColour(getComputedStyle(el).backgroundColor);
    const solid =
      bg &&
      bg.a > 0.8 &&
      pageBg &&
      Math.abs(bg.r - pageBg.r) +
        Math.abs(bg.g - pageBg.g) +
        Math.abs(bg.b - pageBg.b) >
        60;
    const keyword =
      /預約|掛號|booking|book|appointment|reserve|contact|聯絡|get started|start/i.test(
        el.textContent
      );
    const score = (solid ? 2 : 0) + (keyword ? 1 : 0);
    const area = r.width * r.height;
    if (score > 0 && score * 1e7 + area > best) {
      best = score * 1e7 + area;
      cta = toRect(r);
    }
  }

  return {
    viewport: { width: vw, height: vh },
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    textRects,
    textBlocks,
    mediaRects,
    controls,
    targets,
    cta
  };
}

/** 目前所有正在執行或已建立的動畫（CSS transition／animation／WAAPI）。 */
export function collectAnimations() {
  const out = [];
  for (const a of document.getAnimations()) {
    const effect = a.effect;
    if (!effect) continue;
    const keyframes = effect.getKeyframes ? effect.getKeyframes() : [];
    const properties = new Set();
    for (const k of keyframes) {
      for (const key of Object.keys(k)) {
        if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key))
          properties.add(key);
      }
    }
    if (a.transitionProperty) properties.add(a.transitionProperty);
    const timing = effect.getComputedTiming();
    const target = effect.target;
    const scrollDriven =
      a.timeline != null && !(a.timeline instanceof DocumentTimeline);
    out.push({
      kind: a.constructor.name,
      properties: [...properties].map((p) =>
        p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
      ),
      duration: typeof timing.duration === 'number' ? timing.duration : 0,
      iterations: timing.iterations,
      easing: effect.getTiming ? effect.getTiming().easing : '',
      scrollDriven,
      viewTransition: Boolean(
        target &&
        target.nodeType === 1 &&
        target === document.documentElement &&
        a.effect.pseudoElement
      ),
      target:
        target && target.nodeType === 1
          ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}${typeof target.className === 'string' && target.className ? `.${target.className.trim().split(/\s+/)[0]}` : ''}`
          : 'unknown'
    });
  }
  return out;
}
