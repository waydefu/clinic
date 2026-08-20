import {
  DEFAULT_BLOCKED_TIMES,
  SYNTHETIC_CASE_MANAGERS,
  TIME_ZONE
} from './constants.js';
import { cloneSchedule, generateSlots } from './schedule-engine.js';

// v6 → v7（2026-07-28）：移除會讓人誤以為瀏覽器保存正式政策版本的
// `policyVersion`。這個合成流程只有 UI-only「已閱讀告知草稿」gate，沒有政策版本、
// 顯示時間或接受證據；換鍵才能讓已存在的 v6 localStorage 一併淘汰舊欄位。
export const storageKey = 'beauessence_synthetic_online_preview_v7';
const SCHEMA_VERSION = 7;
// 只清理由本應用歷史版本建立過的精確鍵名，不掃整個 localStorage，也不碰主題或
// 同 origin 其他用途的資料。v1～v6 可由 Git 歷史逐一核對。
const LEGACY_STORAGE_KEYS = Object.freeze([
  'beauessence_synthetic_online_preview_v1',
  'beauessence_synthetic_online_preview_v2',
  'beauessence_synthetic_online_preview_v3',
  'beauessence_synthetic_online_preview_v4',
  'beauessence_synthetic_online_preview_v5',
  'beauessence_synthetic_online_preview_v6'
]);

// 營業時間：週三至週五 12:00–20:00，週六 10:00–18:00，週日至週二休診。
function defaultSchedule() {
  return {
    timeZone: TIME_ZONE,
    weeklyAvailability: [
      {
        weekday: 3,
        intervals: [{ startLocalTime: '12:00', endLocalTime: '20:00' }]
      },
      {
        weekday: 4,
        intervals: [{ startLocalTime: '12:00', endLocalTime: '20:00' }]
      },
      {
        weekday: 5,
        intervals: [{ startLocalTime: '12:00', endLocalTime: '20:00' }]
      },
      {
        weekday: 6,
        intervals: [{ startLocalTime: '10:00', endLocalTime: '18:00' }]
      }
    ],
    dateExceptions: [],
    blockedTimes: structuredClone(DEFAULT_BLOCKED_TIMES)
  };
}

export function initialState() {
  const schedule = defaultSchedule();
  return {
    schemaVersion: SCHEMA_VERSION,
    patients: [],
    caseManagers: structuredClone(SYNTHETIC_CASE_MANAGERS),
    schedule,
    scheduleDraft: cloneSchedule(schedule),
    scheduleMeta: {
      publishedVersion: 1,
      draftDirty: false,
      publishedAt: '2026-07-28T00:00:00.000Z'
    },
    slots: generateSlots(schedule),
    appointments: [],
    followUps: [],
    caseAssignments: [],
    auditEvents: [],
    outboxJobs: [],
    sequence: 1,
    patientSequence: 1,
    workspace: {
      currentAccountId: 'admin_test_001',
      // 合成帳密登入原型：這不是安全邊界。帳密只存在這台裝置的瀏覽器、不加密、
      // 明碼顯示在登入頁作為測試提示，正式版必須改為真 IdP＋雜湊憑證（見
      // AUTH-001 與 D-006）。`authenticated` 只控制 UI 要顯示登入頁或工作臺，
      // 權限仍由 currentAccountId 的角色決定，登出不等於伺服器端撤銷。
      authenticated: false,
      accounts: [
        {
          id: 'admin_test_001',
          label: '測試主管',
          role: 'admin',
          status: 'active',
          username: 'admin',
          password: 'beauessence-admin'
        },
        {
          id: 'front_desk_test_001',
          label: '測試櫃台 A',
          role: 'front_desk',
          status: 'active',
          username: 'front',
          password: 'beauessence-front'
        }
      ],
      accountSequence: 2,
      // 權限委派（2026-07-27 負責人：刪除可授權給櫃台，管理者自訂多組授權碼、
      // 可個別開關）。**預設是關的、且一組授權碼都沒有**——委派要是一件管理者
      // 明確做過的事，不是開箱就生效的預設值；出貨時附一組預設密碼，等於沒有
      // 授權這件事。規則在 packages/domain 的 delegated-authorization。
      delegations: [
        {
          permission: 'delete_appointment',
          delegatedToRole: 'front_desk',
          enabled: false,
          authorizations: []
        }
      ],
      authorizationSequence: 1,
      announcement: {
        status: 'published',
        title: '線上預約測試中',
        body: '目前為測試版本，輸入的資料只會留在您這台裝置的瀏覽器。',
        updatedAt: '2026-07-28T00:00:00.000Z'
      },
      maintenance: {
        enabled: false,
        title: '預約系統維護中',
        body: '請稍後再回來，造成不便敬請見諒。',
        startsAt: '',
        // 維護預設是關閉的，這只是表單的初值。留空比留一個寫死的日期誠實——
        // 任何寫死的日期遲早會變成過去，看起來像「已經過期的維護公告」。
        resumeAt: ''
      },
      releases: [
        {
          id: 'release_test_001',
          version: 'preview-6.0',
          summary: '診所官網、預約欄位、隱私告知草稿與角色委派',
          publishedAt: '2026-07-28T00:00:00.000Z'
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
  if ('policyVersion' in state) return false;
  if (REQUIRED_ARRAYS.some((key) => !Array.isArray(state[key]))) return false;

  const workspace = state.workspace;
  if (workspace === null || typeof workspace !== 'object') return false;
  if (typeof workspace.authenticated !== 'boolean') return false;
  if (!Array.isArray(workspace.accounts) || workspace.accounts.length === 0)
    return false;
  // Every synthetic account must carry login credentials, or the login gate
  // would have no way to authenticate it. Missing credentials mean a stale
  // pre-login-prototype blob, so discard it and re-seed.
  if (
    workspace.accounts.some(
      (account) =>
        typeof account?.username !== 'string' ||
        typeof account?.password !== 'string'
    )
  )
    return false;
  if (!Array.isArray(workspace.releases)) return false;
  // 委派設定被改壞時必須整份丟掉重建，不能「當作沒有委派」繼續跑：那會讓一個
  // 被停用的授權在下一次載入後悄悄變成可用（少了 enabled 欄位就沒有東西擋它）。
  if (!Array.isArray(workspace.delegations)) return false;
  if (
    workspace.delegations.some(
      (delegation) =>
        typeof delegation?.permission !== 'string' ||
        typeof delegation?.delegatedToRole !== 'string' ||
        typeof delegation?.enabled !== 'boolean' ||
        !Array.isArray(delegation?.authorizations) ||
        delegation.authorizations.some(
          (authorization) =>
            typeof authorization?.id !== 'string' ||
            typeof authorization?.label !== 'string' ||
            typeof authorization?.secret !== 'string' ||
            typeof authorization?.enabled !== 'boolean'
        )
    )
  )
    return false;
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

function removeLegacyState() {
  for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
}

export function loadState() {
  try {
    removeLegacyState();
    const value = localStorage.getItem(storageKey);
    if (value === null) return initialState();
    const stored = JSON.parse(value);
    return isUsableState(stored) ? stored : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(state) {
  removeLegacyState();
  localStorage.setItem(storageKey, JSON.stringify(state));
  return structuredClone(state);
}

export function resetState() {
  removeLegacyState();
  localStorage.removeItem(storageKey);
  return initialState();
}
