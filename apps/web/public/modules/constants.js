// 防重複的規則與伺服器共用，改從 packages/domain 的編譯產物匯入，避免兩邊
// 各寫一份而漂移（ADR-0004）。這裡只是接力再匯出，讓其餘瀏覽器模組不變。
//
// 直接用相對路徑而非 import map 的裸名：import map 是 inline script，會被本
// 專案的 CSP（script-src 'self'，無 unsafe-inline）擋掉，實機驗證過。相對路徑
// 不涉及 CSP，且單一來源與防漂移的目的完全不受影響。
export {
  ACTIVE_BOOKING_LIMIT,
  ACTIVE_BOOKING_STATUSES
} from '../vendor/domain/index.js';

export const TIME_ZONE = 'Asia/Taipei';

// 診所對外資訊的單一來源。patient.html 的結構化資料與行事曆匯出都以此為準；
// 修改時請一併更新 patient.html 內的 JSON-LD。
export const CLINIC = Object.freeze({
  name: '一森渼診所',
  address: '臺北市松山區光復北路112號2樓'
});
export const SYNTHETIC_WINDOW_START = '2030-01-01';
export const SYNTHETIC_WINDOW_DAYS = 21;
export const SLOT_DURATION_MINUTES = 30;

// 初診走整點與半點，回診走 15 分與 45 分，兩種掛號各自成格。
export const BOOKING_KINDS = Object.freeze({
  INITIAL: 'initial',
  FOLLOW_UP: 'follow_up'
});

export const BOOKING_KIND_LABELS = Object.freeze({
  initial: '初診',
  follow_up: '回診'
});

export const SLOT_MINUTE_MARKS = Object.freeze({
  initial: [0, 30],
  follow_up: [15, 45]
});

// 醫師固定行程，這些時間點不開放掛號。可在排班區自訂。
export const DEFAULT_BLOCKED_TIMES = Object.freeze({
  initial: ['13:00', '15:00', '17:00'],
  follow_up: ['13:15', '15:15', '17:15']
});

// 客戶端可自行選擇的項目。
export const PATIENT_SERVICES = Object.freeze([
  { id: 'service_snoring', label: '止鼾', note: '40–60 分鐘' },
  { id: 'service_aesthetic', label: '醫美', note: '依療程進度' }
]);

// 工作臺建立預約時登記的手術種類。
export const WORKBENCH_PROCEDURES = Object.freeze([
  { id: 'procedure_septum', label: '鼻中膈彎曲' },
  { id: 'procedure_turbinate', label: '下鼻甲' },
  { id: 'procedure_posterior_nasal_nerve', label: '後鼻神經阻斷' },
  { id: 'procedure_soft_palate', label: '軟顎懸壅垂' }
]);

export const BOOKING_NOTE_TAGS = Object.freeze([
  { id: 'same_day', label: '當天到' },
  { id: 'overseas', label: '國外客' },
  { id: 'long_distance', label: '遠距離' }
]);

export const FOLLOW_UP_NOTE_TAGS = Object.freeze([
  { id: 'nose_follow_up', label: '鼻回' },
  { id: 'throat_follow_up', label: '喉回' },
  { id: 'half_year_repair', label: '半年修復' }
]);

// 櫃台對一筆預約可執行的處置。
export const APPOINTMENT_ACTIONS = Object.freeze([
  { id: 'follow_up_confirm', label: '回診確認' },
  { id: 'reschedule', label: '改期' },
  { id: 'cancel', label: '取消' },
  { id: 'no_show', label: '未到' },
  { id: 'complete', label: '到診' }
]);

export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  confirmed: '預約成立',
  cancellation_requested: '取消待確認',
  completed: '已完成到診',
  cancelled: '已取消',
  no_show: '未到'
});

export const ROLE_LABELS = Object.freeze({
  admin: '管理者',
  front_desk: '櫃台員工'
});

export const PERMISSIONS = Object.freeze({
  MANAGE_SCHEDULE: 'manage_schedule',
  MANAGE_FOLLOW_UP: 'manage_follow_up',
  MANAGE_CASES: 'manage_cases',
  MANAGE_ACCOUNTS: 'manage_accounts',
  MANAGE_COMMUNICATIONS: 'manage_communications',
  CREATE_BOOKING: 'create_booking',
  CANCEL_BOOKING: 'cancel_booking',
  COMPLETE_VISIT: 'complete_visit'
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
