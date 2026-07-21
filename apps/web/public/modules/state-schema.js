import {
  SYNTHETIC_CASE_MANAGERS,
  SYNTHETIC_PATIENTS,
  TIME_ZONE
} from './constants.js';
import { cloneSchedule, generateSlots } from './schedule-engine.js';

export const storageKey = 'beauessence_synthetic_online_preview_v2';
const SCHEMA_VERSION = 2;

export function defaultSchedule() {
  return {
    timeZone: TIME_ZONE,
    weeklyAvailability: [
      {
        weekday: 1,
        intervals: [{ startLocalTime: '09:00', endLocalTime: '12:00' }]
      },
      {
        weekday: 2,
        intervals: [{ startLocalTime: '13:00', endLocalTime: '17:00' }]
      }
    ],
    dateExceptions: []
  };
}

export function initialState() {
  const schedule = defaultSchedule();
  return {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: 'privacy-v1',
    serviceId: 'service_test_consult',
    patients: structuredClone(SYNTHETIC_PATIENTS),
    caseManagers: structuredClone(SYNTHETIC_CASE_MANAGERS),
    schedule,
    scheduleDraft: cloneSchedule(schedule),
    scheduleMeta: {
      publishedVersion: 1,
      draftDirty: false,
      publishedAt: '2026-07-21T00:00:00.000Z'
    },
    slots: generateSlots(schedule),
    appointments: [],
    followUps: [],
    caseAssignments: [],
    auditEvents: [],
    outboxJobs: [],
    sequence: 1,
    workspace: {
      currentAccountId: 'admin_test_001',
      accounts: [
        {
          id: 'admin_test_001',
          label: '測試管理者',
          role: 'admin',
          status: 'active'
        },
        {
          id: 'front_desk_test_001',
          label: '測試櫃台 A',
          role: 'front_desk',
          status: 'active'
        }
      ],
      accountSequence: 2,
      announcement: {
        status: 'published',
        title: '合成預約服務測試中',
        body: '目前為非正式線上測試版，請勿輸入任何真實資料。',
        updatedAt: '2026-07-21T00:00:00.000Z'
      },
      maintenance: {
        enabled: false,
        title: '預約系統維護中',
        body: '請稍後再回來測試，造成不便敬請見諒。',
        startsAt: '',
        resumeAt: '2030-01-02T12:00'
      },
      releases: [
        {
          id: 'release_test_001',
          version: 'preview-2.0',
          summary: '模組化管理工作臺、發布排班與個管指派流程',
          publishedAt: '2026-07-21T00:00:00.000Z'
        }
      ]
    }
  };
}

const REQUIRED_ARRAYS = [
  'patients',
  'caseManagers',
  'slots',
  'appointments',
  'followUps',
  'caseAssignments',
  'auditEvents',
  'outboxJobs'
];

// The stored value is attacker-reachable in the sense that anyone can edit
// their own localStorage, and it is also simply stale after a refactor. A
// version tag alone does not prove the shape, so check what the modules
// actually dereference and discard anything that does not hold up.
export function isUsableState(state) {
  if (state === null || typeof state !== 'object') return false;
  if (state.schemaVersion !== SCHEMA_VERSION) return false;
  if (REQUIRED_ARRAYS.some((key) => !Array.isArray(state[key]))) return false;

  const workspace = state.workspace;
  if (workspace === null || typeof workspace !== 'object') return false;
  if (!Array.isArray(workspace.accounts) || workspace.accounts.length === 0)
    return false;
  if (!Array.isArray(workspace.releases)) return false;
  if (
    workspace.announcement === null ||
    typeof workspace.announcement !== 'object'
  )
    return false;
  if (
    workspace.maintenance === null ||
    typeof workspace.maintenance !== 'object'
  )
    return false;

  // A session pointing at a missing or disabled account would leave the user
  // with no resolvable identity, so treat it as unusable rather than letting
  // the permission layer fall back to somebody else's role.
  const session = workspace.accounts.find(
    (account) =>
      account?.id === workspace.currentAccountId && account.status === 'active'
  );
  if (session === undefined) return false;

  return state.schedule !== undefined && state.scheduleDraft !== undefined;
}

export function loadState() {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) return initialState();
    const stored = JSON.parse(value);
    return isUsableState(stored) ? stored : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
  return structuredClone(state);
}

export function resetState() {
  localStorage.removeItem(storageKey);
  return initialState();
}
