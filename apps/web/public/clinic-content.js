export const BOOKING_PATH = '/booking';

export const CLINIC = {
  name: '一森渼診所',
  englishName: 'Beau Essence Clinic',
  phoneDisplay: '02-2577-1314',
  phoneHref: 'tel:+886225771314',
  tollFreeDisplay: '0800-000-913',
  tollFreeHref: 'tel:+886800000913',
  address: '臺北市松山區光復北路112號2樓',
  hours: ['週三至週五 12:00–20:00', '週六 10:00–18:00'],
  // 社群連結一律使用**乾淨的正式網址**，不帶追蹤或介面參數。業主 2026-08-01
  // 提供的原始連結各自帶了不該進版控的東西：
  //   - LINE 帶 `openQrModal=true`，會強制彈出 QR code。手機使用者已經裝了
  //     LINE，卻被要求掃自己螢幕上的 QR，等於多一道無意義的關卡。
  //   - Instagram 帶 `igsh` 與 `utm_source=qr`，那是某一次 QR 分享的追蹤參數，
  //     寫死在網站上會讓之後所有流量都被歸到那一次分享。
  //   - Messenger 給的是 `messenger.com/login.php?next=…`，那是**登入牆**。改用
  //     官方短網址 m.me/<page-id>，手機會直接開 App，桌機則落到同一個對話頁。
  //     page id 575723225620285 就是從原連結的 next 參數裡取出來的。
  socialLinks: [
    { label: 'LINE', href: 'https://page.line.me/821tzbtx' },
    {
      label: 'Instagram',
      href: 'https://www.instagram.com/beauessence.tw'
    },
    { label: 'Messenger', href: 'https://m.me/575723225620285' },
    { label: 'Facebook', href: 'https://www.facebook.com/beauessencetaipei/' }
  ]
};

export const NAVIGATION = [
  { label: '診所首頁', href: '/clinic' },
  { label: '醫師團隊', href: '/clinic/doctors' },
  {
    label: '鼻功能醫學',
    href: '/clinic#nasal-services',
    children: [
      {
        label: '止鼾五合一',
        href: '/clinic/nasal/snoring-five-in-one'
      },
      {
        label: '下鼻甲手術',
        href: '/clinic/nasal/inferior-turbinate-surgery'
      },
      {
        label: '鼻中隔手術',
        href: '/clinic/nasal/septoplasty'
      },
      {
        label: '止鼾好眠牙套',
        href: '/clinic/nasal/snore-relief-mouthguard'
      }
    ]
  }
];

export const DOCTORS = [
  {
    slug: 'yan-cheng-an',
    name: '顏正安 院長',
    title: '自體肋隆鼻權威',
    image: '/clinic-assets/doctor-yan.webp',
    imageAlt: '顏正安院長形象照',
    summary:
      '專注鼻部功能、結構與外觀的整合評估，依每位患者的鼻腔條件規劃治療方向。',
    expertise: ['鼻功能評估', '鼻整形與重建', '鼻中隔與鼻甲治療'],
    education: [
      '高雄醫學大學醫學系',
      '台灣耳鼻喉科專科醫師',
      '台北市聯合醫院主治醫師',
      '非公醫療協會鼻整形分會常委',
      '醫療交流促進會鼻整形分會常委',
      '顏面整形重建醫學會委員',
      '中西醫協會線雕分會常委'
    ],
    publications: [
      '《鼻整形手術精萃》異體肋軟骨章節作者',
      '《Preservation Rhinoplasty》中文版譯者',
      '《Rhinoplasty & Septoplasty》中文版譯者',
      '《Rhinoplasty: Clinical Atlas》中文版副主譯',
      '《Aesthetic Septorhinoplasty》中文版副主譯'
    ]
  },
  {
    slug: 'yang-sheng-feng',
    name: '楊昇峯 醫師',
    title: '麻醉科主治醫師',
    image: '/clinic-assets/doctor-yang.webp',
    imageAlt: '楊昇峯醫師形象照',
    summary:
      '以完整術前評估與麻醉照護為核心，協助患者在治療過程中獲得穩定、安全的醫療照護。',
    expertise: ['麻醉評估', '術中安全照護', '術後恢復管理'],
    education: [
      '臺北醫學大學醫學系',
      '萬芳醫院麻醉科住院醫師',
      '萬芳醫院麻醉科總醫師',
      '禾馨怡仁婦幼中心麻醉科主治醫師',
      '禾馨桃園婦幼診所麻醉科主治醫師'
    ],
    publications: []
  }
];

export const NASAL_SERVICES = [
  {
    slug: 'snoring-five-in-one',
    title: '止鼾五合一',
    eyebrow: 'SNORING CARE',
    subtitle: '從鼻腔結構、呼吸狀況到睡眠品質，一次完成整合評估。',
    image: '/clinic-assets/service-snoring.webp',
    imageAlt: '側躺睡眠時張口呼吸的示意插圖',
    intro:
      '打鼾可能來自鼻腔阻塞、軟組織震動或睡眠呼吸障礙。診所會先由耳鼻喉科醫師檢查鼻腔結構與呼吸狀況，再依個別原因提出合適的治療方向。',
    highlights: [
      '耳鼻喉科醫師進行鼻腔與呼吸評估',
      '依影像與實際結構判斷阻塞位置',
      '依症狀與生活需求規劃個人化方案'
    ],
    sections: [
      {
        heading: '什麼是打鼾？',
        paragraphs: [
          '睡眠時上呼吸道變窄，氣流通過軟組織所產生的震動會形成鼾聲。若同時出現呼吸中止、夜間驚醒或白天嗜睡，可能與阻塞型睡眠呼吸中止症有關，建議進一步接受專業評估。'
        ]
      },
      {
        // 這五項原本只存在於 service-snoring.png 的像素裡（官網 2024/11 的資訊圖，
        // sha256 69d04fee…1e407e）。2026-08-07 搬成文字：文案一字未改，順序依桌機版
        // 原圖；該來源檔同日移除，內容以本段為準，原圖仍可由 git 歷史取回。
        //
        // 為什麼要搬：圖裡的字放大不會變大、報讀器讀不到、也複製不了（WCAG 2.2
        // SC 1.4.5，這些內容用 HTML 完全可以呈現，因此不適用 essential 例外）。
        // 而且官網的桌機版與手機版對這五項的編號順序**不一致**（2/3/4 互換），
        // 兩份圖沒有任何機制會發現彼此分歧——圖片不是可維護的內容來源。
        heading: '打鼾的五個常見成因',
        paragraphs: [
          '打鼾通常不是單一原因造成，下列因素常同時存在。實際情形仍需由醫師面診判斷。'
        ],
        bullets: [
          '體重過重',
          '鼻結構異常：鼻中膈彎曲、下鼻甲肥厚、過敏性鼻炎',
          '咽喉結構異常：舌頭肥厚後傾、軟顎無力、懸壅垂過長',
          '下巴短厚',
          '生活習慣欠佳：抽菸、酒精'
        ]
      },
      {
        heading: '哪些情況適合進一步評估？',
        bullets: [
          '長期打鼾，已影響自己或家人的睡眠',
          '體重較高或頸圍較粗，睡眠時容易呼吸不順',
          '長期鼻塞、過敏性鼻炎或習慣張口呼吸',
          '曾被觀察到睡眠呼吸中止、喘醒或白天嗜睡'
        ]
      },
      {
        heading: '評估流程',
        bullets: [
          '了解鼾聲、睡眠與日間精神狀況',
          '檢查鼻腔、鼻中隔與下鼻甲等上呼吸道結構',
          '必要時建議睡眠檢查或轉介相關專科',
          '依原因說明可行方案、限制與預期恢復情況'
        ]
      }
    ],
    // C3（業主 2026-07-27）：止鼾頁提供 SnoreLab 的官方入口。
    //
    // 網址不是自行拼湊的：三個都是 2026-07-27 從 snorelab.com 首頁上的下載按鈕
    // 讀出來的實際 href。商店網址一旦猜錯，患者會被帶到別人的 App。
    //
    // 措辭刻意保守：它是第三方工具、不是診所的產品，也不是診斷依據。少了這一句，
    // 一個純粹的自我記錄 App 會被讀成診所推薦的醫療器材。
    resources: {
      eyebrow: 'SELF-TRACKING',
      heading: '想先了解自己的鼾聲？',
      paragraphs: [
        '門診時若能描述鼾聲的頻率與強度，評估會更有依據。SnoreLab 是常見的鼾聲錄音應用程式，可在自己的手機上錄下夜間鼾聲並留下紀錄，看診時提供給醫師參考。',
        'SnoreLab 由第三方開發，並非本診所提供的產品或服務，也不是診斷工具；它的紀錄不能取代醫師面診或睡眠檢查。是否需要進一步檢查，仍以門診評估為準。'
      ],
      links: [
        { label: 'SnoreLab 官方網站', href: 'https://www.snorelab.com' },
        {
          label: 'App Store 下載',
          href: 'https://apps.apple.com/us/app/snorelab-record-your-snoring/id529443604'
        },
        {
          label: 'Google Play 下載',
          href: 'https://play.google.com/store/apps/details?id=com.snorelab.app'
        }
      ]
    }
  },
  {
    slug: 'inferior-turbinate-surgery',
    title: '下鼻甲手術',
    eyebrow: 'NASAL AIRWAY',
    subtitle: '改善長期鼻塞，讓日常呼吸與睡眠更順暢。',
    image: '/clinic-assets/service-turbinate.webp',
    imageAlt: '鼻腔內部結構的示意插圖，標示下鼻甲位置',
    intro:
      '下鼻甲肥大會縮小鼻腔呼吸空間。若藥物治療效果有限，醫師可能依檢查結果評估是否以手術縮減肥厚組織，改善鼻塞、呼吸與睡眠品質。',
    highlights: ['傷口小', '療程時間短', '多數情況可當日返家'],
    sections: [
      {
        heading: '常見成因與症狀',
        bullets: [
          '過敏性鼻炎、慢性發炎或反覆感染',
          '長期使用鼻噴劑造成反彈性鼻塞',
          '鼻中隔彎曲導致對側下鼻甲代償性肥大',
          '長期鼻塞、打鼾、嗅覺下降、鼻音或鼻腔壓迫感'
        ]
      },
      {
        heading: '術前請主動告知',
        bullets: [
          '凝血問題、蟹足腫體質、藥物或麻醉過敏',
          '過往手術史與目前慢性疾病',
          '正在使用的抗凝血藥、保健食品或其他藥物'
        ]
      },
      {
        heading: '術後照護',
        bullets: [
          '輕微鼻塞與帶血分泌物通常是短期恢復反應',
          '一週內避免劇烈運動、彎腰與搬重物',
          '避免挖鼻、用力擤鼻或自行清除結痂',
          '兩週內避免酒精、辛辣與過熱食物',
          '依醫囑用藥並準時回診；持續大量出血應立即就醫'
        ]
      }
    ]
  },
  {
    slug: 'septoplasty',
    title: '鼻中隔手術',
    eyebrow: 'SEPTAL CARE',
    subtitle: '針對鼻中隔彎曲造成的結構性阻塞，重新找回通暢呼吸。',
    image: '/clinic-assets/service-septoplasty.webp',
    imageAlt: '兩人夜間安穩入睡的示意插圖',
    intro:
      '鼻中隔是分隔左右鼻腔的結構。先天發育或外傷可能使鼻中隔偏曲；若造成長期鼻塞、反覆鼻竇問題、打鼾或睡眠品質下降，可由醫師評估是否需要矯正。',
    highlights: ['改善結構性鼻塞', '兼顧鼻腔功能', '依個別彎曲程度規劃'],
    sections: [
      {
        heading: '什麼時候需要治療？',
        paragraphs: [
          '鼻中隔彎曲不一定需要手術。若沒有明顯症狀，可定期觀察；輕度鼻塞可先以藥物或鼻噴劑減少黏膜腫脹，但藥物無法改變骨與軟骨結構。症狀嚴重且影響生活時，再由醫師評估手術。'
        ]
      },
      {
        heading: '術前請主動告知',
        bullets: [
          '凝血問題、藥物或麻醉過敏與蟹足腫體質',
          '過往鼻部手術、外傷史與慢性疾病',
          '正在使用的抗凝血藥、保健食品或其他藥物'
        ]
      },
      {
        heading: '術後照護',
        bullets: [
          '依手術情況，鼻腔可能暫時放置填塞物',
          '初期可依醫囑冰敷並保持口腔與鼻腔濕潤',
          '避免熱水澡、彎腰、劇烈活動、用力擤鼻或挖鼻',
          '恢復期間避免辛辣、飲酒與吸菸',
          '若大量出血、發燒或疼痛明顯加劇，應儘速回診'
        ]
      }
    ]
  },
  {
    slug: 'snore-relief-mouthguard',
    title: '止鼾好眠牙套',
    eyebrow: 'SLEEP APPLIANCE',
    subtitle: '非侵入式睡眠輔具，經醫師評估後量身規劃。',
    image: '/clinic-assets/service-mouthguard.webp',
    imageAlt: '止鼾牙套裝在上下排牙齒上的器械示意插圖',
    intro:
      '止鼾牙套可在睡眠時讓下顎或舌頭維持較前方的位置，減少上呼吸道塌陷。是否適用仍需經醫師評估牙齒、顳顎關節、鼻呼吸與睡眠狀況。',
    highlights: ['非侵入式', '個別評估製作', '可攜帶且容易日常使用'],
    sections: [
      {
        heading: '睡眠呼吸問題的常見訊號',
        bullets: [
          '睡醒仍覺得疲累，白天容易嗜睡',
          '長期打鼾、呼吸中止、喘醒或夜間頻繁醒來',
          '注意力與記憶力下降',
          '夜間頻尿或晨起頭痛'
        ]
      },
      {
        heading: '作用方式',
        bullets: [
          '將下顎維持在較前方位置，增加咽喉呼吸空間',
          '減少舌頭後墜造成的上呼吸道阻塞',
          '配合鼻呼吸評估，處理可能同時存在的鼻塞問題'
        ]
      },
      {
        heading: '配戴與清潔',
        bullets: [
          '依醫師指示於每晚睡眠時配戴',
          '初期約需一至兩週適應，若持續疼痛應回診調整',
          '使用量身評估的裝置，不自行購買不合尺寸的產品',
          '以清水與軟毛刷清潔，避免熱水造成變形'
        ]
      }
    ]
  }
];

export const CLINIC_ROUTES = [
  '/clinic',
  '/clinic/doctors',
  ...DOCTORS.map((doctor) => `/clinic/doctors/${doctor.slug}`),
  ...NASAL_SERVICES.map((service) => `/clinic/nasal/${service.slug}`)
];
