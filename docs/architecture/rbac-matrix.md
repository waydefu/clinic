# 角色權限矩陣（RBAC Matrix）

**狀態：** plan-only 收斂提案。**不是**已實作證據，也不關閉任何 D-series 決策。

**撰寫日期：** 2026-08-04

**適用範圍：** 內部工作臺、患者端、domain API、Cloud Functions 與 Firestore Rules

---

## 1. 為什麼需要這一份

目前 repository 裡有**三套互不相容的角色定義**，而已核准的 D-006 基線是第四套。
這不是文件落後於程式，是程式內部本身就分歧：

| 來源 | 角色 | 數量 |
| --- | --- | --- |
| [`apps/web/public/modules/permissions.js`](../../apps/web/public/modules/permissions.js) | `admin`、`front_desk` | 2 |
| [`apps/api/src/platform/authorization/rbac.ts`](../../apps/api/src/platform/authorization/rbac.ts) | `patient`、`front_desk`、`case_manager`、`manager`、`system_admin`、`auditor`、`service_account` | 7 |
| D-006 核准基線（2026-07-28） | administrator／front-desk／**physician** | 3 |
| 負責人 2026-08-04 需求 | 管理者、櫃檯、諮詢師、醫師、病患（＋未來護理師、麻醉、財務） | 5＋3 |

**「醫師」與「諮詢師」在兩份程式碼裡都不存在**，儘管 D-006 核准的基線明確包含
physician。`rbac.ts` 自己的檔頭註解已經承認這張表 predates D-006、需要重新對齊。

角色收斂是 App Shell（誰看得到哪個導覽項）、日程 Drawer（誰看得到金額）與患者端
欄位過濾三者的共同前提。三套定義不收斂，這三塊都蓋在流沙上。

**這件事現在就能做**，因為 D-006 已核准（2026-07-28），不需要等新決策——這是少數
不被 pending 決策擋住的工作。

---

## 2. 目標角色集合

### 2.1 營運角色

| 角色代碼 | 繁中名稱 | 來源 | 說明 |
| --- | --- | --- | --- |
| `manager` | 管理者 | 既有（瀏覽器叫 `admin`） | 診所營運最高權限；金額、員工權限、稽核、系統設定 |
| `front_desk` | 櫃檯 | 既有 | 每日營運主力；預約、改期、取消、個管指派、款項處理 |
| `consultant` | 諮詢師 | **新增** | 只看自己負責的病患與個案金額 |
| `physician` | 醫師 | **新增**（D-006 已核准但未實作） | 只看與自己相關的預約與必要醫療資訊 |
| `patient` | 病患 | 既有（僅伺服器側） | 只看自己的資料與預約 |

### 2.2 未來角色（不在本次收斂範圍）

`nurse`（護理師）、`anesthetist`（麻醉人員）、`finance`（財務）。三者都依賴尚未核准的
決策：護理師與麻醉人員的職務邊界屬於 D-014 臨床紀錄範圍，財務屬於 D-015。
**在對應決策核准前不得建立這三個角色**，即使只是加一個字串列舉——一個存在但無人
使用的角色，日後會被當成「已經支援」。

### 2.3 系統角色（非人類）

`system_admin`（技術管理，與營運的 `manager` 分離）、`auditor`（唯讀稽核）、
`service_account`（服務帳號，預設無任何權限）。這三個保留現行 `rbac.ts` 的定義。

### 2.4 收斂對照

| 現行瀏覽器 | 現行伺服器 | 收斂後 | 動作 |
| --- | --- | --- | --- |
| `admin` | `manager` | `manager` | 瀏覽器改名，避免與 `system_admin` 混淆 |
| `front_desk` | `front_desk` | `front_desk` | 一致，不動 |
| — | `case_manager` | `consultant` | **需負責人確認**：`case_manager`（個管師）與諮詢師是同一個職務，還是兩個？見 §7 未解問題 |
| — | `patient` | `patient` | 瀏覽器端補上 |
| — | — | `physician` | 全新，D-006 已核准 |

---

## 3. 權限矩陣

`✔` 允許；`△` 允許但受資源範圍限制（見 §4）；空白為拒絕。

### 3.1 預約與日程

| 權限 | 管理者 | 櫃檯 | 諮詢師 | 醫師 | 病患 |
| --- | --- | --- | --- | --- | --- |
| `create_appointment` | ✔ | ✔ | | | △ 自己 |
| `reschedule_appointment` | ✔ | ✔ | | | △ 申請 |
| `request_cancellation` | ✔ | ✔ | | | △ 自己 |
| `confirm_cancellation` | ✔ | ✔ | | | |
| `complete_visit` | ✔ | ✔ | | ✔ | |
| `delete_appointment` | ✔ | 委派※ | | | |
| `update_appointment_notes` | ✔ | ✔ | △ 自己個案 | △ 自己相關 | |
| `decide_follow_up` | ✔ | ✔ | △ 自己個案 | ✔ | |
| `publish_schedule` | ✔ | | | | |
| `read_appointment` | ✔ | ✔ | △ 自己個案 | △ 自己相關 | △ 自己 |

※ 委派刪除是**另一條路徑**，不是把權限搬進 `front_desk`。櫃檯憑管理者自訂的授權碼
才能刪除，規則在 [`packages/domain/src/delegated-authorization`](../../packages/domain/src/delegated-authorization.ts)。
角色表刻意不變動，稽核因此永遠分得出「這個角色本來就能做」與「這次是被授權的」。

### 3.2 個案管理

| 權限 | 管理者 | 櫃檯 | 諮詢師 | 醫師 | 病患 |
| --- | --- | --- | --- | --- | --- |
| `assign_case_manager` | ✔ | ✔ | | | |
| `reassign_case_manager` | ✔ | ✔ | | | |
| `read_case_workload` | ✔ | ✔ | △ 自己 | | |

### 3.3 金額與款項（**全部受 D-015 阻擋**）

| 權限 | 管理者 | 櫃檯 | 諮詢師 | 醫師 | 病患 |
| --- | --- | --- | --- | --- | --- |
| `read_payment` | ✔ | ✔ | △ 自己個案 | | △ 自己 |
| `record_payment` | ✔ | ✔ | | | |
| `read_settlement` | ✔ | | △ 自己 | | |
| `close_payroll_period` | ✔ | | | | |
| `record_payroll_adjustment` | ✔ | | | | |

**諮詢師不得看到其他諮詢師的金額**是負責人明確要求，落實位置見 §4.3。

### 3.4 臨床與手術（**全部受 D-014 阻擋**）

| 權限 | 管理者 | 櫃檯 | 諮詢師 | 醫師 | 病患 |
| --- | --- | --- | --- | --- | --- |
| `read_clinical_record` | | | | ✔ | △ 自己 |
| `write_clinical_record` | | | | ✔ | |
| `schedule_surgery` | ✔ | ✔ | | ✔ | |
| `assign_anesthesia` | ✔ | | | ✔ | |

管理者**刻意沒有**臨床紀錄讀寫權。營運最高權限不等於醫療紀錄權限；臨床資料的
accountable owner 依 D-014 必須是具醫事人員身分者。這一條與「管理者有全部功能」
的直覺相反，是刻意的。

### 3.5 系統與稽核

| 權限 | 管理者 | 櫃檯 | 諮詢師 | 醫師 | 病患 |
| --- | --- | --- | --- | --- | --- |
| `manage_staff_accounts` | ✔ | | | | |
| `manage_business_hours` | ✔ | | | | |
| `manage_integrations` | ✔ | | | | |
| `read_audit` | ✔ | | | | |

櫃檯**不可修改最高管理權限**（負責人要求）：`manage_staff_accounts` 不授予
`front_desk`，且伺服器端必須額外拒絕任何把自己或他人提升為 `manager` 的請求，
即使呼叫者本身是 `manager`（防止單點帳號被盜後自我複製）。

---

## 4. 資源範圍（Resource Scope）

角色只回答「這個動作能不能做」，不回答「對這一筆能不能做」。後者是 scope，
現行 [`rbac.ts:120`](../../apps/api/src/platform/authorization/rbac.ts) 已有三種，
本提案新增兩種。

| Scope | 意義 | 現況 |
| --- | --- | --- |
| `any` | 診所層級資源（如班表） | 已實作 |
| `own_patient` | 呼叫者必須是該病患本人（BOLA 防護） | 已實作 |
| `assigned_patient` | 個管／諮詢師負責的病患 | 已實作 |
| `attending_physician` | 該預約的主治醫師 | **新增** |
| `own_settlement` | 呼叫者自己的結算資料 | **新增** |

### 4.1 不得信任前端

**前端傳入的 `role`、`patientId`、`consultantId`、`ownerId` 一律不採信。** 現行
`rbac.ts` 已正確地把 `actorRole` 設計成由注入的 resolver 解析，不在該檔猜測；
新增的兩種 scope 必須沿用同一模式：

- `attending_physician` 由**預約紀錄本身**的 `physicianId` 決定，不由請求參數決定。
- `own_settlement` 由 session 的 `verifiedStaffId` 決定。

### 4.2 拒絕不得洩漏存在性

現行實作有一個容易被改壞的性質，必須保留並在新增 scope 時遵守：**權限判斷只看
角色與範圍，永遠不看目標是否存在**，因此被拒絕的呼叫者無法用回應差異探測真實
病患或預約是否存在（NOT_FOUND enumeration oracle）。

### 4.3 欄位級過濾

「諮詢師不得看到其他諮詢師的金額」無法只用 scope 表達，因為同一筆預約可能同時
被兩位諮詢師以不同理由讀取。實施方式：

1. 查詢層先以 `assigned_patient` 縮小資料列；
2. **序列化層再依角色移除欄位**——`settlementAmount`、`consultantCommission`
   對非本人諮詢師直接不出現在回應中，而不是回傳 `null`。

回傳 `null` 與不回傳該鍵是不同的：前者洩漏「這筆有金額」。

---

## 5. 六個實施位置

負責人要求「不可只靠前端隱藏」。同一條規則必須在六處落實，**且每一處都要有測試**：

| # | 位置 | 現況 | 目標 |
| --- | --- | --- | --- |
| 1 | UI 顯示 | 瀏覽器 `permissions.js`，2 角色 | 收斂為 5 角色；只負責「不顯示」，不作為安全邊界 |
| 2 | Router guard | 工作臺 hash 路由，無 guard | 每個工作區宣告所需 permission；直連 URL 亦擋 |
| 3 | API／Cloud Functions | `rbac.ts` 候選表，**未接線** | 接線於 C4 slice；`evaluateAccess` 為唯一入口 |
| 4 | Firestore Rules | 全域 `allow read, write: if false` | 維持預設拒絕；ADR-0003 不變更 |
| 5 | 查詢結果欄位過濾 | 無 | 依 §4.3 於序列化層實作 |
| 6 | 稽核紀錄 | audit v2 已實作 | 每次拒絕也要寫稽核，不只記錄成功 |

第 4 項值得強調：**Firestore Rules 維持全部拒絕是正確的**，因為 ADR-0001 規定
domain API 是唯一寫入路徑，沒有 client-to-Firestore 資料路徑。RBAC 落在 API 層，
Rules 層的責任是「確保沒有人繞過 API」，不是複製一份角色表。

---

## 6. 驗收條件

1. `packages/contracts` 匯出唯一的 `Role` 型別，瀏覽器與伺服器都從它匯入；
   `check:architecture` 新增守衛，禁止任何檔案自行宣告角色字串字面值。
2. 瀏覽器 `permissions.js` 的 `rolePermissions` 由該共用型別推導，不再手寫。
3. 每個角色都有一支 `tests/e2e/auth-rbac` 分組下的直連 URL 測試：以該角色登入後
   直接輸入其他角色的工作區網址，必須被擋下且不洩漏資料。
4. Firestore rules 測試維持預設拒絕全綠。
5. 稽核事件包含被拒絕的嘗試（actor、permission、scope、結果）。
6. 未核准決策所擋住的權限（§3.3、§3.4 全部），在 `unrouted-inventory.json` 的
   `capabilityGates` 有對應 blocker，且 `check:architecture` 通過。

---

## 7. 未解問題（需負責人回答）

| # | 問題 | 影響 |
| --- | --- | --- |
| Q1 | **`case_manager`（個管師）與「諮詢師」是同一個職務嗎？** 現行程式有 `case_manager`，負責人的需求寫「諮詢師」與「個管」兩個詞並列 | 決定是收斂成一個角色還是兩個。若為兩個，§3.2 的權限要再拆 |
| Q2 | 醫師可否看到自己主治病患的**金額**？ | §3.3 醫師列目前全空，依「不可查看不相關款項」推論而來，未經確認 |
| Q3 | 管理者無臨床紀錄權（§3.4）是否可接受？ | 與「管理者：全部功能」的原始需求牴觸，但符合 D-014 的 accountable owner 原則 |
| Q4 | 櫃檯的「查看及處理全部款項」是否包含**結算**（員工抽成）？ | §3.3 目前給櫃檯 `read_payment` 但不給 `read_settlement` |

**這四題在回答前，對應的權限列不得實作。** 依 [文件生命週期規則](../document-lifecycle.md)
§4，未核准的推論不得被當成已核准。

---

## 8. 相關文件

- [ADR-0001 — domain API 是唯一寫入路徑](../adr/0001-domain-api-is-the-only-write-path.md)
- [ADR-0003 — Firestore 直接存取預設拒絕](../adr/0003-firestore-direct-client-access-is-deny-by-default.md)
- [Stage 2 身分與 Cloud change plan](stage-2-identity-and-cloud-change-plan-2026-07-28.md) — D-006 核准值的 plan-only 切片
- [決策登錄](../product/phase-1-decision-register.md) — D-006／D-007／D-014／D-015 現況
- [產品能力 Roadmap](../roadmap.md#產品能力-roadmapp0p7) — 本文件屬 P0 範圍
- [測試策略](test-strategy.md) — `auth-rbac` 分組與直連 URL 測試
