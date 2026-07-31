// 防重複的規則與伺服器共用，改從 packages/domain 的編譯產物匯入，避免兩邊
// 各寫一份而漂移（ADR-0004）。這裡只是接力再匯出，讓其餘瀏覽器模組不變。
//
// 直接用相對路徑而非 import map 的裸名：import map 是 inline script，會被本
// 專案的 CSP（script-src 'self'，無 unsafe-inline）擋掉，實機驗證過。相對路徑
// 不涉及 CSP，且單一來源與防漂移的目的完全不受影響。
//
// 指向**實際檔案**而不是 vendor/domain/index.js。那個 barrel 是 `export *` ×
// 13，而瀏覽器不做 bundling（刻意保留逐檔可讀性），所以經過 barrel 就等於把
// 薪資、個管、outbox 等患者頁用不到的模組全部下載一遍。深層匯入把 vendor 的
// 傳遞閉包從 13 個檔案縮到 7 個。
export {
  ACTIVE_BOOKING_LIMIT,
  ACTIVE_BOOKING_STATUSES
} from '../vendor/domain/booking-transaction.js';
// 時區與掛號網格是診所規則，不是介面設定：兩邊各寫一份就會漂移，因此同樣
// 從編譯後的 domain 取得（ADR-0004）。
export {
  SLOT_DURATION_MINUTES,
  SLOT_MINUTE_MARKS,
  TAIPEI_TIME_ZONE as TIME_ZONE
} from '../vendor/domain/schedule.js';

// 診所對外資訊的單一來源。patient.html 的結構化資料與行事曆匯出都以此為準；
// 修改時請一併更新 patient.html 內的 JSON-LD。
export const CLINIC = Object.freeze({
  name: '一森渼診所',
  address: '臺北市松山區光復北路112號2樓'
});
// 合成資料的可預約視窗：**由今天起算**一個月（P5，業主 2026-07-27）。
//
// 先前是寫死的 2030-01-01 起 21 天。那讓每一份合成資料都落在一個沒有人會遇到
// 的年份——好處是測試容易，代價是業主看預覽時看到的日期與現實無關，而
// 「當日」篩選永遠是空的。錨點改成今天之後，日期會跟著真實時間走。
//
// 起點是**函式**而不是常數：模組載入的那一刻算一次會讓開著一整天的分頁停在
// 昨天。呼叫端每次產生時段時重算。
export const SYNTHETIC_WINDOW_DAYS = 30;

// 初診走整點與半點，回診走 15 分與 45 分，兩種掛號各自成格。
export const BOOKING_KINDS = Object.freeze({
  INITIAL: 'initial',
  FOLLOW_UP: 'follow_up'
});

export const BOOKING_KIND_LABELS = Object.freeze({
  initial: '初診',
  follow_up: '回診'
});

// 醫師固定行程，這些時間點不開放掛號。可在排班區自訂。
export const DEFAULT_BLOCKED_TIMES = Object.freeze({
  initial: ['13:00', '15:00', '17:00'],
  follow_up: ['13:15', '15:15', '17:15']
});

// 客戶端可自行選擇的項目。D-004 已記錄兩類服務的實際時間都要到診後確認，
// 不能把預約格或先前的療程估時顯示成治療時間。
export const PATIENT_SERVICES = Object.freeze([
  { id: 'service_snoring', label: '止鼾', note: '實際時間到診後確認' },
  { id: 'service_aesthetic', label: '醫美', note: '依療程進度' }
]);

// 工作臺建立預約時登記的療程／看診項目。
//
// 2026-07-27（W6，業主）：下鼻甲由一筆拆成 RF 與電燒兩筆。兩者是不同的術式，
// 合成一個項目會讓排程與統計看不出實際做了哪一種。舊 id `procedure_turbinate`
// 直接消失而非保留別名——Phase 1 沒有任何持久化的真實資料，唯一的資料在使用者
// 瀏覽器的合成狀態裡，保留一個沒人會再選的 id 只會讓清單越長越髒。
export const WORKBENCH_PROCEDURES = Object.freeze([
  { id: 'procedure_septum', label: '鼻中膈彎曲' },
  { id: 'procedure_turbinate_rf', label: '下鼻甲 RF' },
  { id: 'procedure_turbinate_cautery', label: '下鼻甲電燒' },
  { id: 'procedure_posterior_nasal_nerve', label: '後鼻神經阻斷' },
  { id: 'procedure_soft_palate', label: '軟顎懸壅垂' }
]);

export const BOOKING_NOTE_TAGS = Object.freeze([
  { id: 'same_day', label: '當天到' },
  { id: 'overseas', label: '國外客' },
  { id: 'long_distance', label: '遠距離' }
]);

// 患者自己在預約時勾的請求。與上面的 BOOKING_NOTE_TAGS **刻意分開**：那一組是
// 櫃台的營運註記詞彙（誰當天到、誰是國外客），由櫃台判斷後填寫；這一組是患者
// 對這次門診說的話。合成一份會讓稽核分不出「櫃台認定」與「患者自述」。
export const PATIENT_REQUEST_TAGS = Object.freeze([
  { id: 'same_day_procedure', label: '希望當日接受手術' },
  { id: 'foreign_national', label: '外籍人士' }
]);

// 紙本初診基本資料表第五列「如何得知診所訊息」（20260514 版）。複選。
// 親友介紹與員工介紹要能填介紹人姓名，因此另外標記。
export const PATIENT_SOURCE_TAGS = Object.freeze([
  { id: 'web_search', label: '網路搜尋' },
  { id: 'official_site', label: '診所官網' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'forum', label: '論壇' },
  { id: 'threads', label: 'Threads' },
  { id: 'passing_by', label: '路過' },
  { id: 'friend_referral', label: '親友介紹', needsReferrer: true },
  { id: 'staff_referral', label: '員工介紹', needsReferrer: true },
  { id: 'other', label: '其他' }
]);

// 需要另外填介紹人姓名的來源。從清單推導而不是再抄一份 id：抄本會在有人新增
// 第三種介紹管道時默默不同步，而症狀是「勾了卻沒有欄位可填」。
export const SOURCE_TAGS_NEEDING_REFERRER = Object.freeze(
  PATIENT_SOURCE_TAGS.filter((tag) => tag.needsReferrer === true).map(
    (tag) => tag.id
  )
);

export const FOLLOW_UP_NOTE_TAGS = Object.freeze([
  { id: 'nose_follow_up', label: '鼻回' },
  { id: 'throat_follow_up', label: '喉回' },
  { id: 'half_year_repair', label: '半年修復' }
]);

export const PERMISSIONS = Object.freeze({
  MANAGE_SCHEDULE: 'manage_schedule',
  MANAGE_FOLLOW_UP: 'manage_follow_up',
  ASSIGN_CASE: 'assign_case',
  REASSIGN_CASE: 'reassign_case',
  MANAGE_CASES: 'manage_cases',
  MANAGE_ACCOUNTS: 'manage_accounts',
  MANAGE_COMMUNICATIONS: 'manage_communications',
  MANAGE_SYSTEM: 'manage_system',
  CREATE_BOOKING: 'create_booking',
  CANCEL_BOOKING: 'cancel_booking',
  COMPLETE_VISIT: 'complete_visit',
  // 2026-07-24 負責人方向（D-006）：管理者可刪除紀錄。刻意與 CANCEL_BOOKING
  // 分開——取消是櫃台的日常動作，刪除會讓紀錄從營運清單消失，只留稽核。
  DELETE_APPOINTMENT: 'delete_appointment'
});

// 櫃台對一筆預約可執行的處置。帶 permission 的項目只對具備該權限的帳號顯示。
export const APPOINTMENT_ACTIONS = Object.freeze([
  { id: 'follow_up_confirm', label: '回診確認' },
  { id: 'reschedule', label: '改期' },
  { id: 'cancel', label: '取消' },
  { id: 'no_show', label: '未到' },
  { id: 'complete', label: '到診' },
  // W3（業主 2026-07-27）：到診但忘了帶健保卡。
  //
  // 它是**這一次**的事實，記在預約上（`nhiCardMissing`），不是把患者的
  // `hasNhiCard` 改掉——那一欄的語意是「這位患者預計會帶卡」，是一個長期的
  // 屬性。用這次的意外覆蓋它，下一次預約就會顯示他沒有健保卡。
  { id: 'complete_without_card', label: '到診（忘記帶健保卡）' },
  // W7（業主 2026-07-27）：把線上填過的資料印在紙本初診表的大框裡，其餘欄位
  // 留白讓患者到診時手寫。這是一張**排版頁**，不是電子病歷——不儲存任何病歷內容。
  { id: 'print_intake', label: '列印初診基本資料' },
  {
    id: 'delete',
    label: '刪除紀錄',
    permission: PERMISSIONS.DELETE_APPOINTMENT
  }
]);

// 刪除理由是封閉清單而非自由文字：理由會寫進比預約活得更久的稽核事件，
// 自由文字既無法複核，也是病患資料最容易滲進去的地方。
// 「患者要求刪除」刻意不在此列——那是 D-002 的資料權利流程，不是櫃台按鈕。
export const DELETE_APPOINTMENT_REASONS = Object.freeze([
  { id: 'duplicate_record', label: '重複建立的紀錄' },
  { id: 'wrong_patient', label: '掛錯病患' },
  { id: 'created_in_error', label: '誤建／測試資料' }
]);

export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  confirmed: '預約成立',
  cancellation_requested: '取消待確認',
  follow_up_required: '待安排回診',
  completed: '已完成到診',
  cancelled: '已取消',
  no_show: '未到'
});

export const ROLE_LABELS = Object.freeze({
  admin: '主管',
  front_desk: '櫃台員工'
});

export const SYNTHETIC_CASE_MANAGERS = Object.freeze([
  { id: 'manager_test_001', label: '合成個管師 A', status: 'active' },
  { id: 'manager_test_002', label: '合成個管師 B', status: 'active' }
]);

export const WEEKDAY_LABELS = Object.freeze([
  '週日',
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六'
]);
