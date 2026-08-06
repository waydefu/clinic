/**
 * 角色的單一真實來源。
 *
 * ## 為什麼需要這個模組
 *
 * 2026-08-06 的審查證實 repository 裡同時存在**三套互不相容的角色定義**，而已
 * 核准的 D-006 基線是第四套：
 *
 * | 來源                                       | 角色                                   | 數量 |
 * | ------------------------------------------ | -------------------------------------- | ---- |
 * | `apps/web/public/modules/constants.js`     | `admin`、`front_desk`                  | 2    |
 * | `apps/api/src/platform/authorization/rbac` | `patient`…`service_account`            | 7    |
 * | D-006 核准基線（2026-07-28）               | administrator／front-desk／physician   | 3    |
 * | 負責人 2026-08-04 需求                     | 管理者／櫃檯／諮詢師／醫師／病患       | 5    |
 *
 * 這不是文件落後於程式，是程式內部本身就分歧。角色收斂是 App Shell、日程金額
 * 可見性與患者端欄位過濾三者的共同前提；三套定義不收斂，那三塊都蓋在流沙上。
 * `docs/architecture/rbac-matrix.md` 把它列為 P0，且 `docs/roadmap.md` 標明它
 * **不被任何待決決策阻擋**——D-006 已於 2026-07-28 核准。
 *
 * ## 為什麼放在 domain 而不是 contracts
 *
 * rbac-matrix.md §6 寫的是「`packages/contracts` 匯出唯一的 `Role` 型別，瀏覽器
 * 與伺服器都從它匯入」。實作時改放 domain，理由是**contracts 沒有送到瀏覽器的
 * 路徑**：瀏覽器是原生 ESM、沒有打包器，唯一的共享機制是
 * `scripts/sync-domain-vendor.mjs` 把 `packages/domain` 的編譯產物複製進
 * `apps/web/public/vendor/domain/` 並以 sha256 manifest 擋漂移（ADR-0004）。
 * 放進 contracts 會讓「兩邊都從它匯入」這句話在瀏覽器端無法成立，只能再造一份
 * 抄本——那正是本模組要消滅的東西。
 *
 * ## 這個模組**不**做的事
 *
 * 它只定義「有哪些角色」。權限矩陣（誰能做什麼）留在各自的授權層，因為
 * rbac-matrix.md §3.3（金額）與 §3.4（臨床）整段仍被 D-015 與 D-014 阻擋，
 * 而 §7 的 Q1～Q4 尚未由負責人回答。在那之前把權限寫死等於替業主決定醫療與
 * 財務規則。
 */

/**
 * 營運角色。
 *
 * `consultant` 與 `physician` 的**存在**由 D-006 與負責人 2026-08-04 需求支持，
 * 但它們各自能做什麼仍受 D-014／D-015 阻擋，因此本模組不賦予任何權限。
 */
export const OPERATIONAL_ROLES = [
  'manager',
  'front_desk',
  'consultant',
  'physician',
  'patient'
] as const;

/**
 * 非人類角色。沿用 `rbac.ts` 既有定義：`system_admin` 是技術管理，與營運的
 * `manager` 刻意分離；`auditor` 唯讀；`service_account` 預設無任何權限。
 */
export const SYSTEM_ROLES = [
  'system_admin',
  'auditor',
  'service_account'
] as const;

export const ROLES = [...OPERATIONAL_ROLES, ...SYSTEM_ROLES] as const;

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type Role = (typeof ROLES)[number];

/**
 * **未經核准的假設，集中在這一個地方。**
 *
 * rbac-matrix.md §7 Q1：現行伺服器程式有 `case_manager`（個管師），而負責人的
 * 需求文字把「諮詢師」與「個管」兩個詞並列，沒有說明是同一個職務還是兩個。
 *
 * 這裡採取的假設是**同一個職務**，正規名稱為 `consultant`。之所以敢先假設，是
 * 因為兩者在現行程式裡的權限完全重疊；若負責人回答「是兩個職務」，改法是把
 * 這個常數改成 `false` 並新增 `case_manager` 角色，其餘引用處不需要動。
 *
 * 在 Q1 得到答覆前，任何依賴這個假設的權限都不得實作（rbac-matrix.md §7 明訂
 * 「這四題在回答前，對應的權限列不得實作」）。
 */
export const ASSUME_CASE_MANAGER_IS_CONSULTANT = true;

/**
 * 舊角色代碼 → 正規角色。
 *
 * 只用於讀取既有資料與過渡期的相容，**不是**讓兩套名稱長期並存的許可證：
 * 新程式一律直接使用正規代碼。瀏覽器的 `admin` 之所以改名為 `manager`，是為了
 * 與技術管理的 `system_admin` 區分——兩者混用時，稽核分不出「診所營運最高權限」
 * 與「系統技術權限」。
 */
export const LEGACY_ROLE_ALIASES: Readonly<Record<string, Role>> =
  Object.freeze({
    admin: 'manager',
    // 只有在 Q1 假設成立時，`case_manager` 才收斂到 `consultant`。假設被推翻時
    // 這一筆必須消失，而不是靜靜地把個管師當成諮詢師——那會讓一個尚未定義的
    // 職務沿用別人的權限。
    ...(ASSUME_CASE_MANAGER_IS_CONSULTANT
      ? { case_manager: 'consultant' as const }
      : {})
  });

export const ROLE_LABELS: Readonly<Record<Role, string>> = Object.freeze({
  manager: '管理者',
  front_desk: '櫃檯',
  consultant: '諮詢師',
  physician: '醫師',
  patient: '病患',
  system_admin: '系統管理',
  auditor: '稽核',
  service_account: '服務帳號'
});

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

/**
 * 把任何來源的角色字串正規化。
 *
 * 認不得的值回傳 `undefined` 而不是預設角色：**無法解析的身分必須失去權限，
 * 而不是繼承某個人的**。瀏覽器的 `permissionsFor` 早就是這個立場（「刻意沒有
 * fallback」），這裡與它一致。
 */
export function normaliseRole(value: unknown): Role | undefined {
  if (isRole(value)) return value;
  if (typeof value !== 'string') return undefined;
  return LEGACY_ROLE_ALIASES[value];
}
