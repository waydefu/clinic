import {
  BOOKING_PATH,
  CLINIC,
  DOCTORS,
  HOME_DOCTOR_PROFILES,
  HOME_FAQS,
  HOME_PAGE,
  HOME_PROCESS_ITEMS,
  HOME_SPACE,
  HOME_SYMPTOMS,
  HOME_VISIT,
  ICONS,
  NASAL_SERVICES,
  NAVIGATION,
  SEPTUM_ILLUSTRATIONS,
  SNORING_SELF_TRACKING
} from './clinic-content.js';

const main = document.querySelector('#clinic-main');
const navigation = document.querySelector('#clinic-navigation');
const menuButton = document.querySelector('.clinic-menu-button');

if (!(main instanceof HTMLElement) || !(navigation instanceof HTMLElement)) {
  throw new Error('Clinic page shell is incomplete.');
}

function element(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function link(label, href, className) {
  return element('a', { className, text: label, attrs: { href } }, []);
}

// 離站連結一律新分頁開啟，並補上 `rel`。`noopener` 是安全性（被開啟的頁面拿不到
// window.opener），`noreferrer` 是不把患者正在看哪一個療程頁洩漏給第三方網站。
function externalLink(label, href, className) {
  return element('a', {
    className,
    text: label,
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' }
  });
}

function image(src, alt, className, loading = 'lazy') {
  return element('img', {
    className,
    attrs: { src, alt, loading, decoding: 'async' }
  });
}

// 圖示與插圖一律用 createElementNS 逐一建立節點，不把字串當成標記解析——頁面開著
// Trusted Types，而且資料只是座標，沒有理由當成標記解析。圖示是裝飾，旁邊一定有
// 文字，所以對輔助科技隱藏。找不到的圖示回傳 null，element() 會略過它。
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgShape(viewBox, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

// 圖示資料是精簡格式（見 clinic-content.js）：字串是預設線條樣式的路徑。
const DEFAULT_STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 };

function svgIcon(name, className = 'clinic-icon') {
  const paths = ICONS[name];
  if (!paths) return null;
  const svg = svgShape('0 0 24 24', className);
  for (const entry of paths) {
    const part =
      typeof entry === 'string' ? { ...DEFAULT_STROKE, d: entry } : entry;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', part.d);
    path.setAttribute('fill', part.fill ?? 'none');
    if (part.fillRule) path.setAttribute('fill-rule', part.fillRule);
    if (part.stroke) {
      path.setAttribute('stroke', part.stroke);
      path.setAttribute('stroke-width', String(part.strokeWidth ?? 2));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(path);
  }
  return svg;
}

// 鼻中隔類型的示意圖：五張共用鼻子本體，只換鼻中隔那一條。各部位的顏色由 CSS
// 依 class 決定（膚色鼻子、深色鼻孔、黃色鼻中隔），資料裡不寫顏色。
function septumIllustration(type) {
  const septum = SEPTUM_ILLUSTRATIONS.septum[type];
  if (!septum) return null;
  const svg = svgShape(SEPTUM_ILLUSTRATIONS.viewBox, 'clinic-septum__art');
  for (const part of [
    ...SEPTUM_ILLUSTRATIONS.base,
    { part: 'septum', d: septum }
  ]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', part.d);
    path.setAttribute('class', `clinic-septum__${part.part}`);
    svg.append(path);
  }
  return svg;
}

// 社群平台以圖示呈現（業主 2026-10-12：社群很重要，直接用圖示）。連結文字保留給
// 輔助科技；`labelled` 為 true 時名稱也顯示在圖示旁。
const SOCIAL_ICON = {
  LINE: 'line',
  Instagram: 'instagram',
  Messenger: 'messenger',
  Facebook: 'facebook'
};

function socialLink(social, { labelled = true, className = '' } = {}) {
  const key = SOCIAL_ICON[social.label] ?? 'chat';
  const anchor = externalLink(
    '',
    social.href,
    `clinic-social clinic-social--${key} ${className}`.trim()
  );
  anchor.append(
    element('span', { className: 'clinic-social__badge' }, [
      svgIcon(key, 'clinic-social__icon')
    ]),
    element('span', {
      className: labelled ? 'clinic-social__label' : 'visually-hidden',
      text: social.label
    })
  );
  return anchor;
}

function socialRow(className, options) {
  return element(
    'div',
    { className: `clinic-social-row ${className}` },
    CLINIC.socialLinks.map((social) => socialLink(social, options))
  );
}

// 頁尾是靜態 HTML（沒有 JS 時仍是文字連結），這裡只替它補上同一組圖示。
function enhanceFooterSocial() {
  for (const anchor of document.querySelectorAll('.clinic-footer__social a')) {
    const social = CLINIC.socialLinks.find((item) => item.href === anchor.href);
    if (!social) continue;
    const label = anchor.textContent.trim();
    anchor.classList.add(
      'clinic-social',
      `clinic-social--${SOCIAL_ICON[social.label]}`
    );
    anchor.replaceChildren(
      element('span', { className: 'clinic-social__badge' }, [
        svgIcon(SOCIAL_ICON[social.label], 'clinic-social__icon')
      ]),
      element('span', { className: 'clinic-social__label', text: label })
    );
  }
}

/**
 * 麵包屑。`items` 是 `{ label, href? }`，最後一項不帶 href 即當前頁。
 *
 * 2026-08-07 之前這裡是兩份逐字重複的 inline 程式碼（醫師個人頁與療程頁各一份），
 * 而且三個地方偏離語意：外層是 `<div>` 不是 `<ol>`、當前頁沒有標記、分隔符 `/`
 * 是**真實文字節點**所以會被讀出來。視覺看不出問題（五個項目量到的 top／bottom／
 * height 完全一致），axe 也不檢查這三項——所以它撐了很久沒被發現。
 *
 * 分隔符改由 CSS `li:not(:last-child)::after` 產生，DOM 裡不再有那個節點。這是
 * WAI-ARIA APG breadcrumb 的做法。**已知風險**：部分輔助科技會朗讀 CSS generated
 * content。已列入人工 runbook §8-b 待實機確認；若確認會唸，改回
 * `<span aria-hidden="true">`——不要改回沒有標記的文字節點。
 *
 * `aria-current="page"` 對「當前頁不是連結」的情況，APG 列為 optional（它的範例
 * 把當前頁做成連結並標在連結上）。**本專案一律要求明示**，即使當前頁是非連結
 * 元素——這是專案自訂的加嚴規則，讓輔助科技與自動化都有明確的判斷點。
 */
function breadcrumb(items) {
  return element(
    'nav',
    { className: 'clinic-breadcrumb', attrs: { 'aria-label': '麵包屑' } },
    [
      element(
        'ol',
        { className: 'clinic-shell' },
        items.map((item) =>
          element('li', {}, [
            item.href
              ? link(item.label, item.href)
              : element('span', {
                  text: item.label,
                  attrs: { 'aria-current': 'page' }
                })
          ])
        )
      )
    ]
  );
}

function bookingLink(label = '預約諮詢') {
  return link(label, BOOKING_PATH, 'clinic-button clinic-button--primary');
}

function renderNavigation() {
  const list = element('ul', { className: 'clinic-navigation__list' });
  for (const item of NAVIGATION) {
    const itemNode = element('li');
    const itemLink = link(item.label, item.href);
    if (item.href === window.location.pathname) {
      itemLink.setAttribute('aria-current', 'page');
    }
    itemNode.append(itemLink);
    if (item.children) {
      const childList = element('ul', {
        className: 'clinic-navigation__submenu'
      });
      for (const child of item.children) {
        childList.append(element('li', {}, [link(child.label, child.href)]));
      }
      itemNode.append(childList);
    }
    list.append(itemNode);
  }
  navigation.replaceChildren(list);
}

// 首屏實用資訊。2026-08-06 量到的問題：手機（320×568）上首頁總高 8550px，而
// 「門診時間與交通」起點在 y≈6240px——患者要捲過約 11 個畫面才看得到門診時間、
// 電話與地址，首屏只有標語、一句說明與兩顆按鈕。
//
// 這裡重新呈現的是同一組 `CLINIC` 常數，**沒有新增任何醫療或營運敘述**；完整版
// （含休診日與 Google 地圖）仍以下方 #clinic-visit 為準，兩處同源所以不會分歧。
function heroQuickFacts() {
  return element(
    'dl',
    {
      className: 'clinic-hero-facts',
      attrs: { 'aria-label': '門診時間與聯絡資訊' }
    },
    [
      element('div', { className: 'clinic-hero-fact' }, [
        element('dt', {}, [
          svgIcon('clock', 'clinic-hero-fact__icon'),
          '門診時間'
        ]),
        element('dd', {}, [
          element(
            'ul',
            { className: 'clinic-hero-fact__hours' },
            CLINIC.hours.map((line) => element('li', { text: line }))
          )
        ])
      ]),
      element('div', { className: 'clinic-hero-fact' }, [
        element('dt', {}, [svgIcon('phone', 'clinic-hero-fact__icon'), '電話']),
        element('dd', {}, [link(CLINIC.phoneDisplay, CLINIC.phoneHref)])
      ]),
      element('div', { className: 'clinic-hero-fact' }, [
        element('dt', {}, [svgIcon('pin', 'clinic-hero-fact__icon'), '地址']),
        element('dd', {}, [link(CLINIC.address, '#clinic-visit')])
      ]),
      element(
        'div',
        { className: 'clinic-hero-fact clinic-hero-fact--social' },
        [
          element('dt', {}, [
            svgIcon('chat', 'clinic-hero-fact__icon'),
            '社群'
          ]),
          element('dd', {}, [
            socialRow('clinic-social-row--compact', { labelled: false })
          ])
        ]
      )
    ]
  );
}

/**
 * 首頁的鼾聲自我記錄入口。文案與網址和止鼾療程頁共用同一份資料，避免兩個入口
 * 在 App 商店網址更新後各自漂移。聲波只是裝飾，對輔助科技隱藏。
 */
function renderSnoringTrackerSection() {
  const actions = element('div', { className: 'clinic-snore-app__actions' });
  for (const item of SNORING_SELF_TRACKING.links) {
    const isOfficialSite = item.label === 'SnoreLab 官方網站';
    actions.append(
      externalLink(
        item.label,
        item.href,
        `clinic-button ${
          isOfficialSite ? 'clinic-button--outline' : 'clinic-button--primary'
        }`
      )
    );
  }

  return element(
    'section',
    {
      className: 'clinic-snore-app',
      attrs: { 'aria-labelledby': 'clinic-snore-app-title' }
    },
    [
      element('div', { className: 'clinic-shell clinic-snore-app__grid' }, [
        element('div', { className: 'clinic-snore-app__copy' }, [
          element('h2', {
            attrs: { id: 'clinic-snore-app-title' },
            text: SNORING_SELF_TRACKING.heading
          }),
          element('p', { text: SNORING_SELF_TRACKING.paragraphs[0] }),
          element('p', {
            className: 'clinic-snore-app__note',
            text: SNORING_SELF_TRACKING.paragraphs[1]
          })
        ]),
        element('div', { className: 'clinic-snore-app__panel' }, [
          element(
            'div',
            {
              className: 'clinic-snore-app__signal',
              attrs: { 'aria-hidden': 'true' }
            },
            Array.from({ length: 7 }, () => element('span'))
          ),
          element('h3', { text: SNORING_SELF_TRACKING.appLabel }),
          element('p', { text: SNORING_SELF_TRACKING.downloadPrompt }),
          actions
        ])
      ])
    ]
  );
}

// 首頁主線四段（空間 → 困擾 → 流程 → 醫師）的標題前有紅銅色序號，取自品牌牆的
// 銅字（2026-10-12 方向 A+B）。序號只是版面節奏，不是內容，對輔助科技隱藏。
function homeHeading(id, heading, description, index) {
  return element(
    'div',
    {
      className: index ? 'clinic-home-heading has-index' : 'clinic-home-heading'
    },
    [
      index
        ? element('span', {
            className: 'clinic-home-heading__index',
            text: index,
            attrs: { 'aria-hidden': 'true' }
          })
        : undefined,
      element('h2', { attrs: { id }, text: heading }),
      description ? element('p', { text: description }) : undefined
    ]
  );
}

// 首屏：品牌牆是唯一主角（業主 2026-10-10：一張清晰的品牌牆、不輪播）。
// 2026-10-12 方向 A+B：桌機標題在左、照片在右並延伸到視窗右緣；手機照片在上、
// 標題在下。文字一律不疊在照片上，標誌完整留在畫面內。門診時間、電話與地址
// 是一張浮在照片下緣的白色資訊卡。首屏文字不做進場動畫。
function renderHomeArrival() {
  const heroImage = image(
    HOME_PAGE.heroImage,
    HOME_PAGE.heroImageAlt,
    'clinic-arrival__image',
    'eager'
  );
  heroImage.setAttribute('width', '1920');
  heroImage.setAttribute('height', '1080');
  heroImage.setAttribute('fetchpriority', 'high');

  return element(
    'section',
    {
      className: 'clinic-arrival',
      attrs: { 'aria-labelledby': 'clinic-home-title' }
    },
    [
      element('div', { className: 'clinic-arrival__stage' }, [
        element('div', { className: 'clinic-arrival__copy' }, [
          element(
            'h1',
            { attrs: { id: 'clinic-home-title' } },
            HOME_PAGE.heroTitleLines.map((line, index) =>
              element('span', { className: 'clinic-arrival__line' }, [
                index === HOME_PAGE.heroTitleLines.length - 1
                  ? element('span', {
                      className: 'clinic-highlight',
                      text: line
                    })
                  : line
              ])
            )
          ),
          element('p', { text: HOME_PAGE.heroDescription }),
          element('div', { className: 'clinic-arrival__actions' }, [
            bookingLink('線上預約'),
            link(
              '先找出我的困擾',
              '#clinic-symptoms',
              'clinic-button clinic-button--outline'
            )
          ])
        ]),
        element('div', { className: 'clinic-arrival__media' }, [heroImage])
      ]),
      element('div', { className: 'clinic-shell clinic-arrival__facts' }, [
        heroQuickFacts()
      ])
    ]
  );
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 動效時長讀 CSS token，不在 JS 重複寫一份數字。
function motionDuration(token) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const seconds = /^([\d.]+)s$/.exec(value);
  if (seconds) return Number(seconds[1]) * 1000;
  const milliseconds = /^([\d.]+)ms$/.exec(value);
  return milliseconds ? Number(milliseconds[1]) : 0;
}

// 「診所空間」相簿：依進門順序的四張照片，由使用者用按鈕或縮圖切換，不自動輪播。
// 只有最新一次選擇會生效；圖片解碼完成才同時換上照片與說明，換圖只做淡入。
function renderHomeSpace() {
  const photos = HOME_SPACE.photos;
  let current = 0;
  let generation = 0;

  const viewerImage = image(
    photos[0].src,
    photos[0].alt,
    'clinic-space__photo'
  );
  viewerImage.setAttribute('width', '1280');
  viewerImage.setAttribute('height', '800');
  const captionLabel = element('strong', { text: photos[0].label });
  const captionText = element('span', { text: photos[0].caption });
  const captionCount = element('span', {
    className: 'clinic-space__count',
    text: `1 / ${photos.length}`
  });
  const caption = element(
    'figcaption',
    {
      className: 'clinic-space__caption',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' }
    },
    [captionLabel, captionText, captionCount]
  );

  const thumbs = photos.map((photo, index) => {
    const thumbImage = image(photo.src, '', 'clinic-space__thumb-image');
    thumbImage.setAttribute('width', '1280');
    thumbImage.setAttribute('height', '800');
    return element(
      'button',
      {
        className: 'clinic-space__thumb',
        attrs: {
          type: 'button',
          'aria-pressed': String(index === 0),
          'data-space-index': String(index)
        }
      },
      [thumbImage, element('span', { text: photo.label })]
    );
  });

  async function show(index) {
    const next = (index + photos.length) % photos.length;
    if (next === current) return;
    current = next;
    generation += 1;
    const ticket = generation;
    const photo = photos[next];
    for (const [thumbIndex, thumb] of thumbs.entries()) {
      thumb.setAttribute('aria-pressed', String(thumbIndex === next));
    }
    const loader = new Image();
    loader.src = photo.src;
    try {
      await loader.decode();
    } catch {
      // 解碼失敗仍換上照片與說明，讓瀏覽器以一般方式載入。
    }
    if (ticket !== generation) return;
    viewerImage.src = photo.src;
    viewerImage.alt = photo.alt;
    captionLabel.textContent = photo.label;
    captionText.textContent = photo.caption;
    captionCount.textContent = `${next + 1} / ${photos.length}`;
    if (!prefersReducedMotion() && typeof viewerImage.animate === 'function') {
      viewerImage.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: motionDuration('--clinic-duration-effect-fast'),
        easing: 'ease-out'
      });
    }
  }

  const previous = element('button', {
    className: 'clinic-space__step',
    text: '上一張',
    attrs: { type: 'button' }
  });
  const following = element('button', {
    className: 'clinic-space__step',
    text: '下一張',
    attrs: { type: 'button' }
  });
  previous.addEventListener('click', () => void show(current - 1));
  following.addEventListener('click', () => void show(current + 1));
  for (const thumb of thumbs) {
    thumb.addEventListener(
      'click',
      () => void show(Number(thumb.getAttribute('data-space-index')))
    );
  }

  return element(
    'section',
    {
      className: 'clinic-space',
      attrs: { id: 'clinic-space', 'aria-labelledby': 'clinic-space-title' }
    },
    [
      element('div', { className: 'clinic-shell clinic-space__layout' }, [
        element('figure', { className: 'clinic-space__viewer' }, [
          viewerImage,
          caption
        ]),
        element('div', { className: 'clinic-space__aside' }, [
          homeHeading(
            'clinic-space-title',
            HOME_SPACE.title,
            HOME_SPACE.description,
            '01'
          ),
          element(
            'div',
            {
              className: 'clinic-space__steps',
              attrs: { role: 'group', 'aria-label': '切換照片' }
            },
            [previous, following]
          ),
          element(
            'ul',
            {
              className: 'clinic-space__thumbs',
              attrs: { 'aria-label': '選擇要看的空間' }
            },
            thumbs.map((thumb) => element('li', {}, [thumb]))
          )
        ])
      ])
    ]
  );
}

// 困擾導覽與四項照護放在同一段：左邊選困擾，右邊的照護索引同步標出相關服務。
function renderHomeCare() {
  const guidanceTitle = element('strong', { text: HOME_SYMPTOMS[0].title });
  const guidanceDescription = element('p', {
    text: HOME_SYMPTOMS[0].description
  });
  const guidanceLink = link(
    '查看相關服務',
    `/clinic/nasal/${HOME_SYMPTOMS[0].slug}`,
    'clinic-button clinic-button--outline'
  );
  const symptomGrid = element('div', {
    className: 'clinic-symptom-grid',
    attrs: { role: 'group', 'aria-label': '選擇目前最想改善的困擾' }
  });
  for (const [index, symptom] of HOME_SYMPTOMS.entries()) {
    symptomGrid.append(
      element('button', {
        className: 'clinic-symptom-button',
        text: symptom.label,
        attrs: {
          type: 'button',
          'aria-pressed': String(index === 0),
          'aria-controls': 'clinic-symptom-guidance',
          'data-service-slug': symptom.slug,
          'data-symptom-index': String(index)
        }
      })
    );
  }

  const index = element('ol', {
    className: 'clinic-care__index',
    attrs: { 'aria-label': '四項鼻功能與睡眠照護' }
  });
  for (const service of NASAL_SERVICES) {
    const card = element(
      'article',
      {
        className: 'clinic-service-card',
        attrs: { 'data-service-card': service.slug }
      },
      [
        image(service.image, service.imageAlt, 'clinic-service-card__image'),
        element('div', { className: 'clinic-service-card__body' }, [
          element('h3', {}, [
            link(service.title, `/clinic/nasal/${service.slug}`)
          ]),
          element('p', { text: service.subtitle })
        ])
      ]
    );
    card.classList.toggle(
      'is-recommended',
      service.slug === HOME_SYMPTOMS[0].slug
    );
    index.append(element('li', {}, [card]));
  }

  const section = element(
    'section',
    {
      className: 'clinic-care',
      attrs: {
        id: 'nasal-services',
        'aria-labelledby': 'clinic-symptoms-title'
      }
    },
    [
      element('div', { className: 'clinic-shell clinic-care__layout' }, [
        element(
          'div',
          { className: 'clinic-care__guide', attrs: { id: 'clinic-symptoms' } },
          [
            homeHeading(
              'clinic-symptoms-title',
              '你最想改善哪一件事？',
              '選一項困擾，先看可能相關的服務；這項導覽不是醫療診斷。',
              '02'
            ),
            symptomGrid,
            element(
              'div',
              {
                className: 'clinic-symptom-guidance',
                attrs: { id: 'clinic-symptom-guidance' }
              },
              [
                element(
                  'div',
                  {
                    className: 'clinic-symptom-guidance__copy',
                    attrs: {
                      role: 'status',
                      'aria-live': 'polite',
                      'aria-atomic': 'true'
                    }
                  },
                  [guidanceTitle, guidanceDescription]
                ),
                guidanceLink
              ]
            )
          ]
        ),
        index
      ])
    ]
  );

  for (const button of symptomGrid.querySelectorAll('.clinic-symptom-button')) {
    button.addEventListener('click', () => {
      const symptom =
        HOME_SYMPTOMS[Number(button.getAttribute('data-symptom-index'))];
      if (!symptom) return;
      for (const candidate of symptomGrid.querySelectorAll(
        '.clinic-symptom-button'
      )) {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      }
      guidanceTitle.textContent = symptom.title;
      guidanceDescription.textContent = symptom.description;
      guidanceLink.setAttribute('href', `/clinic/nasal/${symptom.slug}`);
      for (const card of index.querySelectorAll('[data-service-card]')) {
        card.classList.toggle(
          'is-recommended',
          card.getAttribute('data-service-card') === symptom.slug
        );
      }
    });
  }
  return section;
}

function renderHomeProcess() {
  return element(
    'section',
    {
      className: 'clinic-process',
      attrs: { 'aria-labelledby': 'clinic-process-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        homeHeading(
          'clinic-process-title',
          '看診會怎麼進行',
          '不是先選手術，而是先了解困擾、檢查原因，再一起比較處理方向。',
          '03'
        ),
        element(
          'ol',
          { className: 'clinic-process__list' },
          HOME_PROCESS_ITEMS.map((item) =>
            element('li', {}, [
              element('span', { className: 'clinic-process__icon' }, [
                svgIcon(item.icon)
              ]),
              element('h3', { text: item.title }),
              element('p', { text: item.description })
            ])
          )
        )
      ])
    ]
  );
}

function renderHomeDoctors() {
  const profiles = element('div', { className: 'clinic-team__profiles' });
  for (const profile of HOME_DOCTOR_PROFILES) {
    const doctor = DOCTORS.find((item) => item.slug === profile.slug);
    if (!doctor) continue;
    const href = `/clinic/doctors/${doctor.slug}`;
    profiles.append(
      element('article', { className: 'clinic-doctor-card' }, [
        image(doctor.image, doctor.imageAlt, 'clinic-doctor-card__image'),
        element('div', { className: 'clinic-doctor-card__body' }, [
          element('h3', {}, [link(doctor.name, href)]),
          element('p', {
            className: 'clinic-doctor-card__focus',
            text: profile.focus
          }),
          element('p', { text: profile.summary }),
          link('醫師介紹', href, 'clinic-text-link')
        ])
      ])
    );
  }
  return element(
    'section',
    {
      className: 'clinic-team',
      attrs: { 'aria-labelledby': 'home-doctors-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        homeHeading(
          'home-doctors-title',
          '醫師團隊',
          '評估、手術與恢復由醫療團隊共同把關。',
          '04'
        ),
        profiles,
        element('p', { className: 'clinic-team__more' }, [
          link('查看醫師介紹', '/clinic/doctors', 'clinic-text-link')
        ])
      ])
    ]
  );
}

function renderHome() {
  const sections = [
    renderHomeArrival(),
    renderHomeSpace(),
    renderHomeCare(),
    renderHomeProcess(),
    renderHomeDoctors(),
    renderSnoringTrackerSection(),
    renderHomeVisitSection(),
    renderHomeFaqSection(),
    callToAction()
  ];
  for (const section of sections.slice(1)) {
    section.setAttribute('data-reveal', '');
  }
  main.replaceChildren(...sections);
}

// 門診表：星期 × 時段打點，資料來自 CLINIC.schedule。打點與橫線只是視覺記號，
// 每一格另有「看診／休診」文字給輔助科技。
function scheduleTable() {
  const head = element('tr', {}, [
    element('th', { text: '時段', attrs: { scope: 'col' } }),
    ...CLINIC.weekdays.map((day) =>
      element('th', { attrs: { scope: 'col' } }, [
        element('span', { className: 'visually-hidden', text: '週' }),
        day
      ])
    )
  ]);
  const rows = CLINIC.schedule.map((slot) =>
    element('tr', {}, [
      element('th', { text: slot.time, attrs: { scope: 'row' } }),
      ...CLINIC.weekdays.map((day) => {
        const open = slot.days.includes(day);
        return element('td', { className: open ? 'is-open' : undefined }, [
          element('span', {
            text: open ? '●' : '－',
            attrs: { 'aria-hidden': 'true' }
          }),
          element('span', {
            className: 'visually-hidden',
            text: open ? '看診' : '休診'
          })
        ]);
      })
    ])
  );
  return element('table', { className: 'clinic-schedule' }, [
    element('caption', { className: 'visually-hidden', text: '每週門診時段' }),
    element('thead', {}, [head]),
    element('tbody', {}, rows)
  ]);
}

// 地圖：預設是本站的簡易地圖，按下按鈕才換成 Google 地圖（業主 2026-10-12）。
// 按之前不會向 Google 送出任何請求；網站的 CSP 只在官網這一面允許
// https://www.google.com 的框架（apps/web/csp-policy.mjs）。
function visitMap() {
  const mapImage = image(
    HOME_VISIT.mapImage,
    HOME_VISIT.mapImageAlt,
    'clinic-visit__map-image'
  );
  mapImage.setAttribute('width', '1600');
  mapImage.setAttribute('height', '900');
  const credit = element('p', { className: 'clinic-visit__credit' }, [
    externalLink(HOME_VISIT.mapAttribution, HOME_VISIT.mapAttributionHref)
  ]);
  const loadButton = element('button', {
    className: 'clinic-button clinic-button--primary',
    text: '顯示 Google 地圖',
    attrs: { type: 'button', 'aria-describedby': 'clinic-visit-consent' }
  });
  const controls = element('div', { className: 'clinic-visit__controls' }, [
    loadButton,
    element('p', {
      text: HOME_VISIT.googleConsent,
      attrs: { id: 'clinic-visit-consent' }
    })
  ]);
  const picture = element('picture', {}, [
    element('source', {
      attrs: {
        media: '(max-width: 48rem)',
        srcset: HOME_VISIT.mapImageCompact,
        width: '600',
        height: '450'
      }
    }),
    mapImage
  ]);
  const canvas = element('div', { className: 'clinic-visit__canvas' }, [
    picture,
    credit
  ]);
  const figure = element('figure', { className: 'clinic-visit__map' }, [
    canvas,
    controls
  ]);
  loadButton.addEventListener('click', () => {
    const frame = element('iframe', {
      className: 'clinic-visit__frame',
      attrs: {
        src: HOME_VISIT.googleEmbedSrc,
        title: HOME_VISIT.googleEmbedTitle,
        referrerpolicy: 'no-referrer',
        sandbox:
          'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
        allowfullscreen: ''
      }
    });
    canvas.replaceChildren(frame);
    controls.remove();
    figure.classList.add('is-live');
    frame.focus();
  });
  return figure;
}

function renderHomeVisitSection() {
  return element(
    'section',
    {
      className: 'clinic-visit',
      attrs: { id: 'clinic-visit', 'aria-labelledby': 'visit-title' }
    },
    // 資訊卡在 DOM 裡排在地圖前面：報讀器先讀到標題與門診時間，再讀到地圖。
    // 畫面上兩者疊在同一格，卡片靠 z-index 蓋在地圖上，順序不影響外觀。
    [
      element('div', { className: 'clinic-shell clinic-visit__inner' }, [
        element('div', { className: 'clinic-visit__card' }, [
          homeHeading('visit-title', '門診時間與交通'),
          scheduleTable(),
          element('p', {
            className: 'clinic-visit__note',
            text: HOME_VISIT.closedNote
          }),
          element('dl', { className: 'clinic-visit__facts' }, [
            element('div', {}, [
              element('dt', {}, [
                svgIcon('pin', 'clinic-hero-fact__icon'),
                '地址'
              ]),
              element('dd', {}, [
                element('span', { text: CLINIC.address }),
                externalLink(
                  '在 Google 地圖開啟',
                  HOME_VISIT.googleOpenHref,
                  'clinic-text-link'
                )
              ])
            ]),
            element('div', {}, [
              element('dt', {}, [
                svgIcon('phone', 'clinic-hero-fact__icon'),
                '電話'
              ]),
              element('dd', {}, [
                link(CLINIC.phoneDisplay, CLINIC.phoneHref),
                link(CLINIC.tollFreeDisplay, CLINIC.tollFreeHref)
              ])
            ])
          ]),
          element('div', { className: 'clinic-visit__actions' }, [
            bookingLink('線上預約')
          ]),
          element(
            'div',
            { className: 'clinic-visit-social clinic-social-row' },
            CLINIC.socialLinks.map((social) =>
              socialLink(social, { className: 'clinic-social-chip' })
            )
          )
        ])
      ]),
      visitMap()
    ]
  );
}

function renderHomeFaqSection() {
  const list = element('div', { className: 'clinic-faq-list' });
  for (const item of HOME_FAQS) {
    list.append(
      element('details', { className: 'clinic-faq-item' }, [
        element('summary', { text: item.question }),
        element('p', { text: item.answer })
      ])
    );
  }
  const section = element(
    'section',
    {
      className: 'clinic-section',
      attrs: { id: 'clinic-faq', 'aria-labelledby': 'faq-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        homeHeading(
          'faq-title',
          '預約前，你可能想先知道',
          '以下說明僅供一般衛教參考，實際狀況仍以醫師面診評估為準。'
        ),
        list
      ])
    ]
  );
  return section;
}

// 內頁沿用首頁的版面語彙（2026-10-12）：不放英文小標、標題用無襯線字、區塊以細線
// 分隔，不用卡片陰影與拱形相框。醫師卡與首頁「醫師團隊」同一組樣式。
function doctorCard(doctor) {
  return element('article', { className: 'clinic-doctor-card' }, [
    image(doctor.image, doctor.imageAlt, 'clinic-doctor-card__image'),
    element('div', { className: 'clinic-doctor-card__body' }, [
      element('h2', {}, [link(doctor.name, `/clinic/doctors/${doctor.slug}`)]),
      element('p', {
        className: 'clinic-doctor-card__focus',
        text: doctor.title
      }),
      element('p', { text: doctor.summary }),
      link('醫師介紹', `/clinic/doctors/${doctor.slug}`, 'clinic-text-link')
    ])
  ]);
}

function pageHero(title, description) {
  return element('section', { className: 'clinic-page-hero' }, [
    element('div', { className: 'clinic-shell clinic-page-hero__inner' }, [
      element('div', {}, [
        element('h1', { text: title }),
        element('p', { text: description })
      ]),
      bookingLink()
    ])
  ]);
}

function renderDoctors() {
  const profiles = element('div', { className: 'clinic-team__profiles' });
  for (const doctor of DOCTORS) profiles.append(doctorCard(doctor));
  main.replaceChildren(
    pageHero(
      '醫師團隊',
      '以專業分工共同照護，讓每一步評估與治療都有清楚依據。'
    ),
    element('section', { className: 'clinic-team' }, [
      element('div', { className: 'clinic-shell' }, [profiles])
    ]),
    callToAction()
  );
}

function renderDoctor(doctor) {
  // 專業領域原本是膠囊標籤，長得像可以按的按鈕（首頁的困擾選擇就是膠囊按鈕），
  // 改成與學經歷相同的清單。
  const details = [
    element('section', {}, [
      element('h2', { text: '專業領域' }),
      listFrom(doctor.expertise)
    ]),
    element('section', {}, [
      element('h2', { text: '學經歷' }),
      listFrom(doctor.education)
    ])
  ];
  if (doctor.publications.length > 0) {
    details.push(
      element('section', {}, [
        element('h2', { text: '專業著作與譯作' }),
        listFrom(doctor.publications)
      ])
    );
  }

  main.replaceChildren(
    breadcrumb([
      { label: '診所首頁', href: '/clinic' },
      { label: '醫師團隊', href: '/clinic/doctors' },
      { label: doctor.name }
    ]),
    element('section', { className: 'clinic-doctor-profile' }, [
      element(
        'div',
        { className: 'clinic-shell clinic-doctor-profile__grid' },
        [
          image(
            doctor.image,
            doctor.imageAlt,
            'clinic-doctor-profile__image',
            'eager'
          ),
          element('div', { className: 'clinic-doctor-profile__intro' }, [
            element('h1', { text: doctor.name }),
            element('strong', { text: doctor.title }),
            element('p', { text: doctor.summary }),
            bookingLink('預約門診')
          ])
        ]
      )
    ]),
    element(
      'div',
      { className: 'clinic-shell clinic-doctor-details' },
      details
    ),
    callToAction()
  );
}

/** 療程頁末尾的外部資源區（目前只有止鼾頁的 SnoreLab）。 */
function resourceSection(resources) {
  const actions = element('div', { className: 'clinic-resource-actions' });
  for (const item of resources.links) {
    actions.append(
      externalLink(
        item.label,
        item.href,
        'clinic-button clinic-button--outline'
      )
    );
  }
  return element('section', { className: 'clinic-resource' }, [
    element('h2', { text: resources.heading }),
    ...resources.paragraphs.map((text) => element('p', { text })),
    actions
  ]);
}

function listFrom(items) {
  const list = element('ul', { className: 'clinic-content-list' });
  for (const item of items) list.append(element('li', { text: item }));
  return list;
}

// 「打鼾的五個常見成因」：原文是「成因：細項、細項」，在這裡拆成卡片標題與細項，
// 文字本身不改。卡片之間的箭頭只是視覺，對輔助科技隱藏。
function causeCards(section) {
  return element(
    'ol',
    { className: 'clinic-causes' },
    section.bullets.map((bullet, index) => {
      const [title, rest] = bullet.split('：');
      return element('li', { className: 'clinic-causes__item' }, [
        element('div', { className: 'clinic-causes__card' }, [
          element('div', { className: 'clinic-causes__top' }, [
            element('span', { className: 'clinic-causes__icon' }, [
              svgIcon(section.icons?.[index])
            ]),
            // 清單本身是有序的，編號只是視覺，不進可及名稱。
            element('span', {
              className: 'clinic-causes__number',
              text: String(index + 1),
              attrs: { 'aria-hidden': 'true' }
            })
          ]),
          element('h3', { text: title }),
          rest
            ? element(
                'ul',
                { className: 'clinic-sparkle-list' },
                rest.split('、').map((item) => element('li', { text: item }))
              )
            : undefined
        ])
      ]);
    })
  );
}

function stepFlow(section) {
  return element(
    'ol',
    { className: 'clinic-steps' },
    section.bullets.map((bullet, index) =>
      element('li', {}, [
        element('span', { className: 'clinic-steps__icon' }, [
          svgIcon(section.icons?.[index])
        ]),
        element('p', { text: bullet })
      ])
    )
  );
}

function septumTypes(section) {
  return element(
    'ul',
    { className: 'clinic-septum' },
    section.items.map((item) =>
      element('li', { className: 'clinic-septum__card' }, [
        element('h3', { text: item.title }),
        element('div', { className: 'clinic-septum__figure' }, [
          septumIllustration(item.type)
        ]),
        element(
          'p',
          {},
          item.lines.flatMap((line, index) =>
            index === 0 ? [line] : [element('br'), line]
          )
        )
      ])
    )
  );
}

// 處理方式比較表（業主 2026-10-12 選定中性版）。真正的表格：欄標題與列標題各有
// scope，手機上由 CSS 改排成一種方式一張卡片，每格以 data-label 顯示欄名。
function compareTable(section) {
  const cell = (items) =>
    items.length > 1
      ? element(
          'ul',
          { className: 'clinic-compare__list' },
          items.map((item) => element('li', { text: item }))
        )
      : items[0];
  const devices = section.devices
    ? element(
        'ul',
        { className: 'clinic-devices' },
        section.devices.map((device) =>
          element('li', { className: 'clinic-devices__card' }, [
            element('div', { className: 'clinic-devices__figure' }, [
              image(device.image, device.imageAlt, 'clinic-devices__image')
            ]),
            element('h3', { text: device.name }),
            element('p', { text: `治療部位：${device.scope}` })
          ])
        )
      )
    : undefined;
  return element('div', { className: 'clinic-compare' }, [
    devices,
    // 手機版把表格改成區塊排版，部分瀏覽器會因此拿掉表格語意，所以明確標上角色。
    element('table', { attrs: { role: 'table' } }, [
      element('caption', {
        className: 'visually-hidden',
        text: section.heading
      }),
      element('thead', { attrs: { role: 'rowgroup' } }, [
        element('tr', { attrs: { role: 'row' } }, [
          element('th', {
            text: '方式',
            attrs: { scope: 'col', role: 'columnheader' }
          }),
          ...section.columns.map((column) =>
            element('th', {
              text: column,
              attrs: { scope: 'col', role: 'columnheader' }
            })
          )
        ])
      ]),
      element(
        'tbody',
        { attrs: { role: 'rowgroup' } },
        section.rows.map((row) =>
          element('tr', { attrs: { role: 'row' } }, [
            element('th', {
              text: row.name,
              attrs: { scope: 'row', role: 'rowheader' }
            }),
            ...row.cells.map((items, index) =>
              element(
                'td',
                {
                  attrs: { 'data-label': section.columns[index], role: 'cell' }
                },
                [cell(items)]
              )
            )
          ])
        )
      )
    ]),
    element('p', { className: 'clinic-compare__note', text: section.note })
  ]);
}

function renderService(service) {
  const highlights = element('ul', { className: 'clinic-highlight-list' });
  for (const [index, item] of service.highlights.entries()) {
    highlights.append(
      element('li', {}, [
        element('span', { className: 'clinic-highlight-list__icon' }, [
          svgIcon(service.highlightIcons?.[index])
        ]),
        element('span', { text: item })
      ])
    );
  }
  const content = element('div', { className: 'clinic-service-content' });
  for (const section of service.sections) {
    const sectionNode = element(
      'section',
      { className: section.layout ? `is-${section.layout}` : undefined },
      [element('h2', { text: section.heading })]
    );
    for (const paragraph of section.paragraphs ?? []) {
      sectionNode.append(element('p', { text: paragraph }));
    }
    if (section.photo) {
      sectionNode.append(
        element('figure', { className: 'clinic-product-photo' }, [
          element('div', { className: 'clinic-devices__figure' }, [
            image(
              section.photo.image,
              section.photo.imageAlt,
              'clinic-devices__image'
            )
          ]),
          element('figcaption', { text: section.photo.caption })
        ])
      );
    }
    if (section.layout === 'causes') sectionNode.append(causeCards(section));
    else if (section.layout === 'steps') sectionNode.append(stepFlow(section));
    else if (section.layout === 'compare')
      sectionNode.append(compareTable(section));
    else if (section.layout === 'septum-types')
      sectionNode.append(septumTypes(section));
    else if (section.bullets) sectionNode.append(listFrom(section.bullets));
    content.append(sectionNode);
  }
  if (service.resources) content.append(resourceSection(service.resources));

  main.replaceChildren(
    breadcrumb([
      { label: '診所首頁', href: '/clinic' },
      { label: '鼻功能醫學', href: '/clinic#nasal-services' },
      { label: service.title }
    ]),
    element('section', { className: 'clinic-service-hero' }, [
      element('div', { className: 'clinic-shell clinic-service-hero__grid' }, [
        element('div', { className: 'clinic-service-hero__copy' }, [
          element('h1', { text: service.title }),
          element('p', {
            className: 'clinic-service-hero__subtitle',
            text: service.subtitle
          }),
          element('p', { text: service.intro }),
          highlights,
          bookingLink('預約專業評估')
        ]),
        image(
          service.image,
          service.imageAlt,
          'clinic-service-hero__image',
          'eager'
        )
      ])
    ]),
    element('section', { className: 'clinic-section clinic-section--white' }, [
      element('div', { className: 'clinic-shell clinic-content-grid' }, [
        content,
        element('aside', { className: 'clinic-medical-note' }, [
          element('h2', { text: '先評估，再選擇' }),
          element('p', {
            text: '本頁內容僅供一般衛教參考，實際診斷、適應症、風險與恢復時間會因個人狀況而異，需由醫師面診後說明。'
          }),
          link('安排門診評估', BOOKING_PATH, 'clinic-text-link')
        ])
      ])
    ]),
    callToAction()
  );
}

function callToAction() {
  return element('section', { className: 'clinic-cta' }, [
    element('div', { className: 'clinic-shell clinic-cta__inner' }, [
      element('div', {}, [
        element('h2', { text: '讓專業評估，成為安心的第一步' }),
        element('p', {
          text: `線上選擇門診時段，或致電 ${CLINIC.phoneDisplay} 由專人協助。`
        })
      ]),
      element('div', { className: 'clinic-cta__actions' }, [
        // 2026-10-12 淺色系：收尾區改成舊版的淡綠背景圖，按鈕回到主色實心＋外框。
        link(
          '前往線上預約',
          BOOKING_PATH,
          'clinic-button clinic-button--primary'
        ),
        link(
          `致電 ${CLINIC.phoneDisplay}`,
          CLINIC.phoneHref,
          'clinic-button clinic-button--outline'
        )
      ])
    ])
  ]);
}

function renderNotFound() {
  main.replaceChildren(
    element('section', { className: 'clinic-not-found' }, [
      element('p', { className: 'clinic-eyebrow', text: '404' }),
      element('h1', { text: '找不到這個診所頁面' }),
      element('p', { text: '頁面可能已移動，請返回診所首頁繼續瀏覽。' }),
      link('返回診所首頁', '/clinic', 'clinic-button clinic-button--primary')
    ])
  );
  document.title = '【測試用】找不到頁面｜一森渼診所';
}

function upsertMeta(attribute, key, content) {
  let meta = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!(meta instanceof HTMLMetaElement)) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.setAttribute('content', content);
}

function setMeta(
  title,
  description,
  image = '/clinic-assets/clinic-logo.webp'
) {
  const isPreview = document
    .querySelector('meta[name="robots"]')
    ?.getAttribute('content')
    ?.includes('noindex');
  const fullTitle = `${isPreview ? '【測試用】' : ''}${title}｜${CLINIC.name}`;
  const canonicalUrl = new URL(
    window.location.pathname.replace(/\/+$/, '') || '/clinic',
    window.location.origin
  ).href;
  const imageUrl = new URL(image, window.location.origin).href;

  document.title = fullTitle;
  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', fullTitle);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:locale', 'zh_TW');
  upsertMeta('property', 'og:site_name', CLINIC.name);
  upsertMeta('property', 'og:url', canonicalUrl);
  upsertMeta('property', 'og:image', imageUrl);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', fullTitle);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', imageUrl);

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!(canonical instanceof HTMLLinkElement)) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;
}

function renderRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/clinic';
  if (path === '/clinic') {
    setMeta(HOME_PAGE.seoTitle, HOME_PAGE.seoDescription, HOME_PAGE.heroImage);
    renderHome();
    return;
  }
  if (path === '/clinic/doctors') {
    setMeta('醫師團隊', '認識一森渼診所專業醫師團隊。');
    renderDoctors();
    return;
  }
  const doctor = DOCTORS.find(
    (item) => path === `/clinic/doctors/${item.slug}`
  );
  if (doctor) {
    setMeta(doctor.name, doctor.summary, doctor.image);
    renderDoctor(doctor);
    return;
  }
  const service = NASAL_SERVICES.find(
    (item) => path === `/clinic/nasal/${item.slug}`
  );
  if (service) {
    setMeta(service.title, service.subtitle, service.image);
    renderService(service);
    return;
  }
  renderNotFound();
}

function closeMenu() {
  if (!(menuButton instanceof HTMLButtonElement)) return;
  menuButton.setAttribute('aria-expanded', 'false');
  navigation.classList.remove('is-open');
}

if (menuButton instanceof HTMLButtonElement) {
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    navigation.classList.toggle('is-open', !open);
  });
  navigation.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

// ---------------------------------------------------------------------------
// 動效
//
// 進場效果的初始狀態（隱藏、位移）全部掛在 `.clinic-motion` 底下，而這個類別
// 只有在這支腳本真的執行時才會加上去。JS 失效時使用者看到的是完整內容，而不是
// 一頁空白——那是「用 JS 隱藏、再用 JS 顯示」最典型的災難。
//
// 同樣的理由，這裡不讀 `prefers-reduced-motion` 來決定要不要加類別：偏好可能在
// 瀏覽期間才改變，交給 CSS 的 media query 處理才會即時反應。

function enableMotion() {
  document.documentElement.classList.add('clinic-motion');
}

/**
 * 讓區塊在進入視窗時淡入。
 *
 * 觀察到之後立刻 `unobserve`：來回捲動時重複播放會讓長篇衛教內容變得很吵，而且
 * 每次重播都要重新合成一次圖層。`rootMargin` 的下緣留 -10%，讓元素露出約一成
 * 才觸發，避免剛冒出一個邊角就開始動。
 */
function observeReveals(root) {
  const targets = root.querySelectorAll('[data-reveal]');
  if (targets.length === 0) return;

  // 沒有 IntersectionObserver 就直接顯示，不留在隱藏狀態。
  if (typeof IntersectionObserver !== 'function') {
    for (const target of targets) target.classList.add('is-revealed');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );

  for (const [index, target] of targets.entries()) {
    target.style.setProperty('--clinic-stagger', String(index % 4));
    observer.observe(target);
  }
}

/**
 * 捲離頁首時把 header 收合。
 *
 * 用哨兵元素而不是 scroll 監聽器：scroll 事件每一幀都會觸發，是這類效果最常見
 * 的卡頓來源，而這裡真正需要知道的只是「有沒有越過頁首」這一個布林值。
 */
function observeHeaderCondense() {
  const header = document.querySelector('.clinic-header');
  if (header === null || typeof IntersectionObserver !== 'function') return;

  const sentinel = element('div', {
    className: 'clinic-header-sentinel',
    attrs: { 'aria-hidden': 'true' }
  });
  header.before(sentinel);

  new IntersectionObserver(
    ([entry]) => header.classList.toggle('is-condensed', !entry.isIntersecting),
    { threshold: 0 }
  ).observe(sentinel);
}

function applyMotion() {
  const main = document.querySelector('#clinic-main');
  if (main === null) return;
  observeReveals(main);
}

// 換頁轉場刻意不寫在這裡。這個站是真實的跨文件導覽，不是 SPA——`renderRoute()`
// 只在載入時跑一次。跨文件的 View Transition 由 CSS 的 `@view-transition`
// 宣告即可，瀏覽器自己處理；用 JS 包一層 `startViewTransition` 在這個架構下
// 不會被觸發，只會留下一段永遠不執行的程式碼。

enableMotion();
observeHeaderCondense();
renderNavigation();
enhanceFooterSocial();
renderRoute();
applyMotion();
