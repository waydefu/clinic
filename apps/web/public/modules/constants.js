export const TIME_ZONE = 'Asia/Taipei';
export const SYNTHETIC_WINDOW_START = '2030-01-01';
export const SYNTHETIC_WINDOW_DAYS = 21;
export const SLOT_DURATION_MINUTES = 30;

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

export const SYNTHETIC_PATIENTS = Object.freeze([
  { id: 'patient_test_001', label: '合成患者 001' },
  { id: 'patient_test_002', label: '合成患者 002' },
  { id: 'patient_test_003', label: '合成患者 003' }
]);

export const SYNTHETIC_CASE_MANAGERS = Object.freeze([
  { id: 'manager_test_001', label: '合成個管師 A', status: 'active' },
  { id: 'manager_test_002', label: '合成個管師 B', status: 'active' }
]);

export const WEEKDAY_LABELS = Object.freeze([
  '週日', '週一', '週二', '週三', '週四', '週五', '週六'
]);
