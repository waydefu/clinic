import {
  BOOKING_PATH,
  CLINIC,
  DOCTORS,
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

function renderHome() {
  const heroTopics = element('div', { className: 'clinic-home-hero__topics' });
  for (const service of NASAL_SERVICES) {
    heroTopics.append(
      link(service.title, `/clinic/nasal/${service.slug}`, 'clinic-hero-topic')
    );
  }
  const hero = element(
    'section',
    {
      className: 'clinic-home-hero',
      attrs: { 'aria-labelledby': 'clinic-home-title' }
    },
    [
      element('div', { className: 'clinic-shell clinic-home-hero__grid' }, [
        element('div', { className: 'clinic-home-hero__copy' }, [
          element('p', {
            className: 'clinic-eyebrow',
            text: 'FUNCTION · BREATH · SLEEP'
          }),
          element('h1', {
            attrs: { id: 'clinic-home-title' },
            text: '從順暢呼吸開始，找回一夜好眠'
          }),
          element('p', {
            text: '以耳鼻喉專業評估鼻腔結構、打鼾與睡眠呼吸問題，從原因出發，規劃適合你的照護方向。'
          }),
          element('div', { className: 'clinic-home-hero__actions' }, [
            link(
              '認識鼻功能醫學',
              '#nasal-services',
              'clinic-button clinic-button--light'
            ),
            bookingLink('線上預約')
          ])
        ]),
        element(
          'div',
          {
            className: 'clinic-home-hero__visual',
            attrs: { 'aria-label': '鼻功能整合照護' }
          },
          [
            element('div', { className: 'clinic-home-hero__orb' }, [
              element('span', { text: '從原因開始' }),
              element('strong', { text: '鼻功能醫學' }),
              element('small', { text: '呼吸・鼻塞・打鼾・睡眠' })
            ]),
            heroTopics
          ]
        )
      ])
    ]
  );

  const careItems = [
    {
      title: '傾聽',
      text: '先理解困擾與期待，再一起討論真正需要的治療。',
      image: '/clinic-assets/care-listening.png'
    },
    {
      title: '治療',
      text: '以專業評估為基礎，清楚說明方案、限制與恢復過程。',
      image: '/clinic-assets/care-treatment.png'
    },
    {
      title: '環境',
      text: '從候診到術後照護，保留舒適、安定且具隱私的空間。',
      image: '/clinic-assets/care-environment.png'
    },
    {
      title: '照護',
      text: '不只完成一次療程，也重視回診追蹤與長期健康。',
      image: '/clinic-assets/care-aftercare.png'
    }
  ];
  const careGrid = element('div', { className: 'clinic-care-grid' });
  for (const item of careItems) {
    careGrid.append(
      element('article', { className: 'clinic-care-card' }, [
        image(item.image, '', 'clinic-care-card__icon'),
        element('h3', { text: item.title }),
        element('p', { text: item.text })
      ])
    );
  }
  const careSection = element('section', { className: 'clinic-care-section' }, [
    element('div', { className: 'clinic-shell' }, [
      sectionHeading(
        'OUR APPROACH',
        '在每一次醫療選擇裡，保留被理解的空間',
        '功能、美感與生活品質並不互相衝突。我們從原因出發，陪你找到合適而不過度的照護。'
      ),
      careGrid
    ])
  ]);

  const serviceGrid = element('div', {
    className: 'clinic-card-grid clinic-card-grid--services'
  });
  for (const service of NASAL_SERVICES) {
    serviceGrid.append(serviceCard(service));
  }
  const services = element(
    'section',
    {
      className: 'clinic-section',
      attrs: { id: 'nasal-services', 'aria-labelledby': 'services-title' }
    },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'NASAL FUNCTIONAL MEDICINE',
          '鼻功能醫學',
          '針對鼻塞、打鼾與睡眠呼吸問題，從結構與症狀進行完整評估。'
        ),
        serviceGrid
      ])
    ]
  );
  services.querySelector('h2')?.setAttribute('id', 'services-title');

  const doctorGrid = element('div', {
    className: 'clinic-card-grid clinic-card-grid--doctors'
  });
  for (const doctor of DOCTORS) doctorGrid.append(doctorCard(doctor));
  const doctors = element(
    'section',
    { className: 'clinic-section clinic-section--white' },
    [
      element('div', { className: 'clinic-shell' }, [
        sectionHeading(
          'MEDICAL TEAM',
          '醫師團隊',
          '由專業醫療團隊共同把關評估、治療與恢復過程。'
        ),
        doctorGrid,
        element('div', { className: 'clinic-section-action' }, [
          link(
            '查看完整醫師介紹',
            '/clinic/doctors',
            'clinic-button clinic-button--outline'
          )
        ])
      ])
    ]
  );

  main.replaceChildren(hero, careSection, services, doctors, callToAction());
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
    element(
      'nav',
      { className: 'clinic-breadcrumb', attrs: { 'aria-label': '麵包屑' } },
      [
        element('div', { className: 'clinic-shell' }, [
          link('診所首頁', '/clinic'),
          element('span', { text: '/' }),
          link('醫師團隊', '/clinic/doctors'),
          element('span', { text: '/' }),
          element('span', { text: doctor.name })
        ])
      ]
    ),
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
    element(
      'nav',
      { className: 'clinic-breadcrumb', attrs: { 'aria-label': '麵包屑' } },
      [
        element('div', { className: 'clinic-shell' }, [
          link('診所首頁', '/clinic'),
          element('span', { text: '/' }),
          link('鼻功能醫學', '/clinic#nasal-services'),
          element('span', { text: '/' }),
          element('span', { text: service.title })
        ])
      ]
    ),
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

function setMeta(title, description) {
  document.title = `【測試用】${title}｜一森渼診所`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', description);
}

function renderRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/clinic';
  if (path === '/clinic') {
    setMeta('診所介紹', '一森渼診所醫師團隊、鼻功能醫學與線上預約資訊。');
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
    setMeta(doctor.name, doctor.summary);
    renderDoctor(doctor);
    return;
  }
  const service = NASAL_SERVICES.find(
    (item) => path === `/clinic/nasal/${item.slug}`
  );
  if (service) {
    setMeta(service.title, service.subtitle);
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

renderNavigation();
renderRoute();
