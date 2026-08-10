import {
  BOOKING_PATH,
  CLINIC,
  DOCTORS,
  HOME_DOCTOR_PROFILES,
  HOME_FAQS,
  HOME_PAGE,
  HOME_PROCESS_ITEMS,
  HOME_SYMPTOMS,
  NASAL_SERVICES,
  NAVIGATION
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

function sectionHeading(eyebrow, heading, description) {
  return element('div', { className: 'clinic-section-heading' }, [
    element('p', { className: 'clinic-eyebrow', text: eyebrow }),
    element('h2', { text: heading }),
    description ? element('p', { text: description }) : undefined
  ]);
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
        element('dt', { text: '門診時間' }),
        element('dd', {}, [
          element(
            'ul',
            { className: 'clinic-hero-fact__hours' },
            CLINIC.hours.map((line) => element('li', { text: line }))
          )
        ])
      ]),
      element('div', { className: 'clinic-hero-fact' }, [
        element('dt', { text: '電話' }),
        element('dd', {}, [link(CLINIC.phoneDisplay, CLINIC.phoneHref)])
      ]),
      element('div', { className: 'clinic-hero-fact' }, [
        element('dt', { text: '地址' }),
        element('dd', {}, [link(CLINIC.address, '#clinic-visit')])
      ])
    ]
  );
}

function homeDoctorCard(doctor, focus, summary) {
  return element('article', { className: 'clinic-doctor-card' }, [
    image(doctor.image, doctor.imageAlt, 'clinic-doctor-card__image'),
    element('div', { className: 'clinic-doctor-card__body' }, [
      element('p', { className: 'clinic-eyebrow', text: 'MEDICAL TEAM' }),
      element('h3', {}, [link(doctor.name, `/clinic/doctors/${doctor.slug}`)]),
      element('p', { className: 'clinic-home-doctor__focus', text: focus }),
      element('p', { text: summary }),
      link('認識醫師', `/clinic/doctors/${doctor.slug}`, 'clinic-text-link')
    ])
  ]);
}

function renderHome() {
  const heroImage = image(
    HOME_PAGE.heroImage,
    HOME_PAGE.heroImageAlt,
    'clinic-hybrid-hero__image',
    'eager'
  );
  heroImage.setAttribute('width', '540');
  heroImage.setAttribute('height', '405');
  heroImage.setAttribute('fetchpriority', 'high');

  const hero = element(
    'section',
    {
      className: 'clinic-hybrid-hero',
      attrs: { 'aria-labelledby': 'clinic-home-title' }
    },
    [
      element('div', { className: 'clinic-shell clinic-hybrid-hero__grid' }, [
        element('div', { className: 'clinic-hybrid-hero__copy' }, [
          element('p', {
            className: 'clinic-eyebrow',
            text: HOME_PAGE.heroEyebrow
          }),
          element('h1', {
            attrs: { id: 'clinic-home-title' },
            text: HOME_PAGE.heroTitle
          }),
          element('p', {
            text: HOME_PAGE.heroDescription
          }),
          element('div', { className: 'clinic-hybrid-hero__actions' }, [
            link(
              '先找出我的困擾',
              '#clinic-symptoms',
              'clinic-button clinic-button--outline'
            ),
            bookingLink('線上預約')
          ]),
          heroQuickFacts()
        ]),
        element('div', { className: 'clinic-hybrid-hero__visual' }, [
          element('div', { className: 'clinic-hybrid-hero__media' }, [
            heroImage,
            element('div', { className: 'clinic-hybrid-hero__caption' }, [
              element('span', { text: '鼻塞・打鼾・睡眠' }),
              element('strong', { text: HOME_PAGE.heroCaption })
            ])
          ]),
          element(
            'ul',
            {
              className: 'clinic-hybrid-hero__topics',
              attrs: { 'aria-label': '主要照護方向' }
            },
            HOME_PAGE.heroTopics.map((topic) => element('li', { text: topic }))
          )
        ])
      ])
    ]
  );

  const guidanceTitle = element('strong', {
    text: HOME_SYMPTOMS[0].title
  });
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
    attrs: { 'aria-label': '選擇目前最想改善的困擾' }
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
  const symptomSection = element(
    'section',
    {
      className: 'clinic-symptom-section',
      attrs: {
        id: 'clinic-symptoms',
        'aria-labelledby': 'clinic-symptoms-title'
      }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'SYMPTOM GUIDE',
          '你最想改善哪一件事？',
          '選擇一項困擾，先了解可能相關的服務；這項導引不等於醫療診斷。'
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
      ])
    ]
  );
  symptomSection
    .querySelector('h2')
    ?.setAttribute('id', 'clinic-symptoms-title');

  const serviceGrid = element('div', {
    className: 'clinic-card-grid clinic-card-grid--services'
  });
  for (const service of NASAL_SERVICES) {
    const card = serviceCard(service);
    card.setAttribute('data-service-card', service.slug);
    card.classList.toggle(
      'is-recommended',
      service.slug === HOME_SYMPTOMS[0].slug
    );
    serviceGrid.append(card);
  }
  const services = element(
    'section',
    {
      className: 'clinic-section clinic-section--white clinic-home-services',
      attrs: { id: 'nasal-services', 'aria-labelledby': 'services-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'FOUR CARE DIRECTIONS',
          '四項鼻功能與睡眠照護',
          '首頁只保留鼻塞、打鼾與睡眠呼吸相關服務，讓下一步更容易理解。'
        ),
        serviceGrid
      ])
    ]
  );
  services.querySelector('h2')?.setAttribute('id', 'services-title');

  const processList = element(
    'ol',
    { className: 'clinic-home-process__list' },
    HOME_PROCESS_ITEMS.map((item) =>
      element('li', {}, [
        element('h3', { text: item.title }),
        element('p', { text: item.description })
      ])
    )
  );
  const processSection = element(
    'section',
    {
      className: 'clinic-home-process',
      attrs: { 'aria-labelledby': 'clinic-process-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'ASSESSMENT PROCESS',
          '把複雜的問題，分成四個清楚步驟',
          '不是先選手術，而是先了解困擾、檢查原因，再一起比較處理方向。'
        ),
        processList
      ])
    ]
  );
  processSection
    .querySelector('h2')
    ?.setAttribute('id', 'clinic-process-title');

  const homeDoctorGrid = element('div', {
    className:
      'clinic-card-grid clinic-card-grid--doctors clinic-home-doctor-grid'
  });
  for (const profile of HOME_DOCTOR_PROFILES) {
    const doctor = DOCTORS.find((item) => item.slug === profile.slug);
    if (doctor) {
      homeDoctorGrid.append(
        homeDoctorCard(doctor, profile.focus, profile.summary)
      );
    }
  }
  const doctors = element(
    'section',
    {
      className: 'clinic-section clinic-home-doctors',
      attrs: { 'aria-labelledby': 'home-doctors-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'MEDICAL TEAM',
          '先完整評估，再討論適合你的方向',
          '評估、手術與恢復由醫療團隊共同把關；首頁只呈現鼻功能與手術照護相關資訊。'
        ),
        homeDoctorGrid,
        element('div', { className: 'clinic-section-action' }, [
          link(
            '查看醫師介紹',
            '/clinic/doctors',
            'clinic-button clinic-button--outline'
          )
        ])
      ])
    ]
  );
  doctors.querySelector('h2')?.setAttribute('id', 'home-doctors-title');

  const visitSection = renderHomeVisitSection();
  const faqSection = renderHomeFaqSection();
  const sections = [
    hero,
    symptomSection,
    services,
    processSection,
    doctors,
    visitSection,
    faqSection,
    callToAction()
  ];
  for (const section of sections.slice(1)) {
    section.setAttribute('data-reveal', '');
  }
  main.replaceChildren(...sections);

  for (const button of symptomGrid.querySelectorAll('.clinic-symptom-button')) {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-symptom-index'));
      const symptom = HOME_SYMPTOMS[index];
      if (!symptom) return;

      for (const candidate of symptomGrid.querySelectorAll(
        '.clinic-symptom-button'
      )) {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      }
      guidanceTitle.textContent = symptom.title;
      guidanceDescription.textContent = symptom.description;
      guidanceLink.setAttribute('href', `/clinic/nasal/${symptom.slug}`);
      for (const card of serviceGrid.querySelectorAll('[data-service-card]')) {
        card.classList.toggle(
          'is-recommended',
          card.getAttribute('data-service-card') === symptom.slug
        );
      }
    });
  }
}

function renderHomeVisitSection() {
  const section = element(
    'section',
    {
      className: 'clinic-section clinic-section--white',
      attrs: { id: 'clinic-visit', 'aria-labelledby': 'visit-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'VISIT US',
          '門診時間與交通',
          '就診前想先確認的資訊都放在這裡；門診時間如遇國定假日將另行公告。'
        ),
        element('hr', { className: 'clinic-section-rule' }),
        element('div', { className: 'clinic-visit-grid' }, [
          element('article', { className: 'clinic-visit-card' }, [
            element('h3', { text: '門診時間' }),
            element('ul', { className: 'clinic-visit-list' }, [
              ...CLINIC.hours.map((line) => element('li', { text: line })),
              element('li', { text: '週日、週一、週二　休診' })
            ])
          ]),
          element('article', { className: 'clinic-visit-card' }, [
            element('h3', { text: '地址與交通' }),
            element('p', { text: CLINIC.address }),
            externalLink(
              '在 Google 地圖開啟',
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                CLINIC.address
              )}`,
              'clinic-button clinic-button--outline'
            )
          ]),
          element('article', { className: 'clinic-visit-card' }, [
            element('h3', { text: '聯絡方式' }),
            element('ul', { className: 'clinic-visit-list' }, [
              element('li', {}, [link(CLINIC.phoneDisplay, CLINIC.phoneHref)]),
              element('li', {}, [
                link(CLINIC.tollFreeDisplay, CLINIC.tollFreeHref)
              ])
            ]),
            element(
              'div',
              { className: 'clinic-visit-social' },
              CLINIC.socialLinks.map((social) =>
                externalLink(social.label, social.href, 'clinic-social-chip')
              )
            )
          ])
        ])
      ])
    ]
  );
  section.querySelector('h2')?.setAttribute('id', 'visit-title');
  return section;
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
        sectionHeading(
          'FAQ',
          '預約前，你可能想先知道',
          '以下說明僅供一般衛教參考，實際狀況仍以醫師面診評估為準。'
        ),
        element('hr', { className: 'clinic-section-rule' }),
        list
      ])
    ]
  );
  section.querySelector('h2')?.setAttribute('id', 'faq-title');
  return section;
}

function serviceCard(service) {
  const imageLink = link(
    '',
    `/clinic/nasal/${service.slug}`,
    'clinic-service-card__media'
  );
  imageLink.append(
    image(service.image, service.imageAlt, 'clinic-service-card__image')
  );
  return element('article', { className: 'clinic-service-card' }, [
    imageLink,
    element('div', { className: 'clinic-service-card__body' }, [
      element('p', { className: 'clinic-eyebrow', text: service.eyebrow }),
      element('h3', {}, [link(service.title, `/clinic/nasal/${service.slug}`)]),
      element('p', { text: service.subtitle }),
      link('了解更多', `/clinic/nasal/${service.slug}`, 'clinic-text-link')
    ])
  ]);
}

function doctorCard(doctor) {
  return element('article', { className: 'clinic-doctor-card' }, [
    image(doctor.image, doctor.imageAlt, 'clinic-doctor-card__image'),
    element('div', { className: 'clinic-doctor-card__body' }, [
      element('p', { className: 'clinic-eyebrow', text: 'MEDICAL TEAM' }),
      element('h3', {}, [link(doctor.name, `/clinic/doctors/${doctor.slug}`)]),
      element('strong', { text: doctor.title }),
      element('p', { text: doctor.summary }),
      link('醫師介紹', `/clinic/doctors/${doctor.slug}`, 'clinic-text-link')
    ])
  ]);
}

function pageHero(eyebrow, title, description) {
  return element('section', { className: 'clinic-page-hero' }, [
    element('div', { className: 'clinic-shell clinic-page-hero__inner' }, [
      element('div', {}, [
        element('p', { className: 'clinic-eyebrow', text: eyebrow }),
        element('h1', { text: title }),
        element('p', { text: description })
      ]),
      bookingLink()
    ])
  ]);
}

function renderDoctors() {
  const grid = element('div', {
    className: 'clinic-card-grid clinic-card-grid--doctors'
  });
  for (const doctor of DOCTORS) grid.append(doctorCard(doctor));
  main.replaceChildren(
    pageHero(
      'MEDICAL TEAM',
      '醫師團隊',
      '以專業分工共同照護，讓每一步評估與治療都有清楚依據。'
    ),
    element('section', { className: 'clinic-section' }, [
      element('div', { className: 'clinic-shell' }, [grid])
    ]),
    callToAction()
  );
}

function renderDoctor(doctor) {
  const expertise = element('ul', { className: 'clinic-pill-list' });
  for (const item of doctor.expertise) {
    expertise.append(element('li', { text: item }));
  }
  const education = listFrom(doctor.education);
  const details = [
    element('section', {}, [
      element('p', { className: 'clinic-eyebrow', text: 'EXPERTISE' }),
      element('h2', { text: '專業領域' }),
      expertise
    ]),
    element('section', {}, [
      element('p', { className: 'clinic-eyebrow', text: 'EDUCATION' }),
      element('h2', { text: '學經歷' }),
      education
    ])
  ];
  if (doctor.publications.length > 0) {
    details.push(
      element('section', {}, [
        element('p', { className: 'clinic-eyebrow', text: 'PUBLICATIONS' }),
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
            element('p', { className: 'clinic-eyebrow', text: 'MEDICAL TEAM' }),
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
    element('p', { className: 'clinic-eyebrow', text: resources.eyebrow }),
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

function renderService(service) {
  const highlights = element('ul', { className: 'clinic-highlight-list' });
  for (const item of service.highlights) {
    highlights.append(element('li', { text: item }));
  }
  const content = element('div', { className: 'clinic-service-content' });
  for (const section of service.sections) {
    const sectionNode = element('section', {}, [
      element('h2', { text: section.heading })
    ]);
    for (const paragraph of section.paragraphs ?? []) {
      sectionNode.append(element('p', { text: paragraph }));
    }
    if (section.bullets) sectionNode.append(listFrom(section.bullets));
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
          element('p', { className: 'clinic-eyebrow', text: service.eyebrow }),
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
          element('p', { className: 'clinic-eyebrow', text: 'MEDICAL NOTE' }),
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
        element('p', { className: 'clinic-eyebrow', text: 'APPOINTMENT' }),
        element('h2', { text: '讓專業評估，成為安心的第一步' }),
        element('p', {
          text: `線上選擇門診時段，或致電 ${CLINIC.phoneDisplay} 由專人協助。`
        })
      ]),
      element('div', { className: 'clinic-cta__actions' }, [
        bookingLink('前往線上預約'),
        link(
          `致電 ${CLINIC.phoneDisplay}`,
          CLINIC.phoneHref,
          'clinic-button clinic-button--outline-light'
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
  if (document.querySelector('.clinic-scroll-progress') === null) {
    document.body.prepend(
      element('div', {
        className: 'clinic-scroll-progress',
        attrs: { 'aria-hidden': 'true' }
      })
    );
  }
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

/** Hero 內各層的進場順序。 */
function stageHero(root) {
  const copy = root.querySelector('.clinic-hybrid-hero__copy');
  if (copy === null) return;
  for (const [index, child] of [...copy.children].entries()) {
    child.style.setProperty('--clinic-stagger', String(index));
  }
  const visual = root.querySelector('.clinic-hybrid-hero__visual');
  if (visual !== null) visual.style.setProperty('--clinic-stagger', '2');
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

/**
 * 把標題拆成一個字一個 span，讓它可以逐字浮現（動效 21）。
 *
 * 只拆一次，而且**保留原本的文字內容**：報讀器讀的是另外留的那份完整字串，
 * 拆成 span 不影響它。整段一律走 `textContent` 與 `createElement`——把 HTML
 * 字串指派給元素會帶進 XSS 風險，`clinic-site.test.ts` 用純文字比對釘住了這
 * 一點。那道比對連註解都會掃到，所以這裡只能敘述它、不能寫出那個屬性名。
 */
function splitHeadingWords(root) {
  const heading = root.querySelector('.clinic-hybrid-hero__copy h1');
  if (heading === null || heading.querySelector('.clinic-word') !== null)
    return;

  const text = heading.textContent ?? '';
  const words = text.split(/(\s+)/u).filter(Boolean);
  // 中文沒有空白分隔，`split` 會得到一整段。那種情況改成逐字拆。
  const units = words.length > 1 ? words : [...text];

  // 視覺層對報讀器隱藏，另外保留一份完整文字。
  //
  // 拆成一堆 `display: inline-block` 的 span 之後，可及名稱的計算會在每個
  // inline-block 之間補一個空白——中文標題於是變成「從 順 暢 呼 吸 開 始」，
  // 報讀器會逐字唸出主標題。那不是測試的怪癖，是真的聽不懂。
  const visual = element('span', { attrs: { 'aria-hidden': 'true' } });
  for (const [index, unit] of units.entries()) {
    const span = element('span', { className: 'clinic-word', text: unit });
    span.style.setProperty('--clinic-word-index', String(index));
    visual.append(span);
  }

  heading.replaceChildren(
    element('span', { className: 'visually-hidden', text }),
    visual
  );
}

/**
 * 指標聚光燈與磁吸（動效 18、20）。
 *
 * 只寫 CSS 自訂屬性，不直接改 style.transform——把「怎麼畫」留在 CSS，
 * `prefers-reduced-motion` 才有辦法一次關掉全部。指標事件用 `pointermove`
 * 而不是 `mousemove`，觸控筆與觸控都會走同一條路徑。
 */
function bindPointerEffects(root) {
  const spotlightTargets = root.querySelectorAll(
    '.clinic-service-card, .clinic-doctor-card, .clinic-visit-card'
  );
  for (const card of spotlightTargets) {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect();
      card.style.setProperty(
        '--clinic-x',
        `${((event.clientX - box.left) / box.width) * 100}%`
      );
      card.style.setProperty(
        '--clinic-y',
        `${((event.clientY - box.top) / box.height) * 100}%`
      );
    });
  }

  const magnets = document.querySelectorAll(
    '.clinic-button--primary, .clinic-header__booking'
  );
  for (const magnet of magnets) {
    magnet.addEventListener('pointermove', (event) => {
      const box = magnet.getBoundingClientRect();
      // 上限 0.25rem。再大就變成按鈕在閃躲游標。
      const limit = 4;
      const x =
        ((event.clientX - (box.left + box.width / 2)) / box.width) * limit;
      const y =
        ((event.clientY - (box.top + box.height / 2)) / box.height) * limit;
      magnet.style.setProperty('--clinic-magnet-x', `${x.toFixed(2)}px`);
      magnet.style.setProperty('--clinic-magnet-y', `${y.toFixed(2)}px`);
    });
    magnet.addEventListener('pointerleave', () => {
      magnet.style.removeProperty('--clinic-magnet-x');
      magnet.style.removeProperty('--clinic-magnet-y');
    });
  }
}

/** 導覽聚光指示條（動效 22）。 */
function bindNavSpotlight() {
  const list = navigation.querySelector('.clinic-navigation__list');
  if (list === null || list.querySelector('.clinic-nav-spotlight') !== null)
    return;

  const spotlight = element('span', {
    className: 'clinic-nav-spotlight',
    attrs: { 'aria-hidden': 'true' }
  });
  list.append(spotlight);

  const move = (target) => {
    const listBox = list.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    spotlight.style.width = `${box.width}px`;
    spotlight.style.transform = `translate3d(${box.left - listBox.left}px, 0, 0)`;
    spotlight.style.opacity = '1';
  };

  for (const anchor of list.querySelectorAll(':scope > li > a')) {
    anchor.addEventListener('pointerenter', () => move(anchor));
    // 鍵盤也要有：只綁 pointer 事件等於這個回饋對 Tab 使用者不存在。
    anchor.addEventListener('focus', () => move(anchor));
  }
  list.addEventListener('pointerleave', () => {
    spotlight.style.opacity = '0';
  });
}

/** 網格逐格錯開（動效 24）。 */
function indexGridCells(root) {
  const grids = root.querySelectorAll('.clinic-card-grid, .clinic-visit-grid');
  for (const grid of grids) {
    for (const [index, cell] of [...grid.children].entries()) {
      cell.style.setProperty('--clinic-cell', String(index));
    }
  }
}

function applyMotion() {
  const main = document.querySelector('#clinic-main');
  if (main === null) return;
  splitHeadingWords(main);
  stageHero(main);
  indexGridCells(main);
  bindPointerEffects(main);
  observeReveals(main);
}

// 換頁轉場刻意不寫在這裡。這個站是真實的跨文件導覽，不是 SPA——`renderRoute()`
// 只在載入時跑一次。跨文件的 View Transition 由 CSS 的 `@view-transition`
// 宣告即可，瀏覽器自己處理；用 JS 包一層 `startViewTransition` 在這個架構下
// 不會被觸發，只會留下一段永遠不執行的程式碼。

enableMotion();
observeHeaderCondense();
renderNavigation();
bindNavSpotlight();
renderRoute();
applyMotion();
