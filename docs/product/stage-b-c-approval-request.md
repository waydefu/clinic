# 階段 B 與 C 核准請求（D-006、D-010、D-009）

**狀態：部分核准。** 本文件把「接雲端資料庫」與「接 Google 日曆」的決策集中
成一份。內容整理自
[中文核准清單](phase-1-chinese-approval-checklist.md) 與
[整合與公開上線核准包](phase-1-integration-launch-approval-packet.md)，
不新增任何政策；填寫後請同步登錄
[決策登錄](phase-1-decision-register.md)。

**2026-07-29 更新：** D-010 target architecture/SLO 與 D-006 identity/security
已核准；D-009 仍待核准。Stage 2 是 C1～C6 的 umbrella，每個 slice 仍須各自的
精確 request、change-plan review、deployment authority 與 apply approval；C1
isolated foundation 不含 IdP、Firestore、backup/PITR 或 runtime。本文件因此尚未
整體完成。

**現行階段對照（2026-07-28）：** 本文件沿用早期 A／B／C／D 名稱；A 已併入並
完成於 Stage 0，B 對應 Stage 2 cloud staging，C 對應 Stage 3 專用測試日曆，
D 對應 Stage 4 真實資料。專案目前在 Stage 1 owner decisions。

## 為什麼是這三項

| 階段 | 內容 | 卡住的決策 |
| --- | --- | --- |
| A | 本機 Emulator 的交易、冪等、outbox | 無 — **已於 2026-07-21 完成** |
| **B** | Stage 2 合成 cloud staging umbrella：C1 isolated foundation，後續 C2～C6 才含 IdP、Firestore 與 runtime | **D-006/D-010 是前置；每個 slice 仍須各自 request、deployment authority 與 apply approval，C1 不解鎖後續資源** |
| **C** | Google 日曆投影（專用測試日曆） | **D-009** |
| D | 開始處理真實病患資料 | D-001～D-005、D-011（本文件不涵蓋） |

階段 B 與 C **全程使用測試資料**，不處理真實病患資料，因此不需要 D-001～D-003。
D-010 已核准 primary region 與 target SLO，但每個 Stage 2 slice 的 change review
與 authority 仍須完成
供應商、成本、IAM、復原路徑與部署證據；一旦要輸入真實病患資料，就必須先完成
D-001～D-003 的法遵／跨境治理，否則不得進行。

---

## D-006｜身分驗證、角色與寫入權限

**決策狀態：已於 2026-07-28 核准；尚未實作或驗證。**

**核准責任人：** 診所負責人＋資安負責人
**為什麼仍不能直接進階段 B：** 目前工作臺的「操作帳號」只是畫面模擬。政策值
已核准，但真 IdP、server session、撤銷、hash、RBAC 與 cloud boundary 尚未實作，
且 change/deployment action 尚未核准。

- [x] 員工登入：Google federated sign-in＋診所自管帳號；credential 由核准 IdP
      管理，不放入應用資料庫。
- [x] Phase 1 staff roles：`administrator`、`front_desk`、`physician`；未明示
      action 預設拒絕。個管／薪資／臨床／財務角色另依 D-007／D-008／D-014／
      D-015。
- [x] 全體員工 MFA；自管帳號 TOTP。Google 帳號若沒有可驗證的組織 MFA，仍須
      應用層第二因子。
- [x] Session：閒置 30 分鐘、絕對上限 8 小時；停用帳號完成後，下一個 protected
      request 必須被拒絕。
- [x] 完成到診：櫃檯與管理者；醫師不因新增角色自動取得其他 action。
- [x] 所有正式寫入經 API 驗證、授權、欄位驗證、冪等與 audit；前端不得直接
      寫入 Firestore。
- [x] 管理者可依限定理由刪預約；audit 永久、append-only，任何角色不能修改或
      刪除。
- [x] 管理者可用多組授權碼委派櫃檯刪預約；授權碼只存安全 KDF 結果、可個別
      撤銷、不回顯並限制錯誤嘗試。

實作切片、provider 限制、待審查的錯誤上限／recovery 參數、驗收與回滾見
[Stage 2 身分與 Cloud change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)。
未核准 recovery／break-glass 前 fail closed，不自行加入隱藏 bypass。

```text
核准內容／附件位置：
核准人姓名及職務：
核准日期（Asia/Taipei）：
```

---

## D-010｜Firebase、環境與維運責任

**決策狀態：target architecture/SLO 已於 2026-07-28 核准；尚未部署或驗證。**

**核准責任人：** 技術負責人＋資安負責人（所有權部分由診所負責人）
**為什麼擋住階段 B：** 這決定資料放哪裡、誰有權限、壞掉怎麼救。

| 項目 | 核准答案 | 核准者 |
| --- | --- | --- |
| 環境分離 | `✅ dev / staging / production；各自獨立帳務與資料；實際 project ID 待 Stage 2 change plan` | `業主 2026-07-28` |
| Firebase／Google Cloud 所有權 | `✅ 診所為法定／帳務擁有者；管理者＋開發者持受治理 IAM，不得填入帳密` | `業主 2026-07-28` |
| Firestore 資料位置與跨境評估 | `✅ primary region asia-east1；正式資料仍需 D-002` | `業主 2026-07-28` |
| IAM 與管理者帳號 | `[最小角色、MFA、定期覆核]` | |
| 服務帳號、Secret Manager 與輪替 | `[最小權限與輪替流程]` | |
| 備份、還原演練與保存 | `✅ target RPO 1 小時／RTO 4 小時，適用 database、whole-project、regional failure；待實作與演練證據` | `業主 2026-07-28` |
| 日誌、監控、告警與值班 | `[範圍、接收者、升級流程]` | |
| 個資事件應變與對外聯繫 | `[runbook、聯絡角色、法律覆核]` | |
| IaC、部署與回滾核准 | `[CI/CD、變更審核、回滾擁有者]` | |

2026-07-28 核准值：診所是 Cloud project 的法定／帳務擁有者，管理者與開發者
持受治理的 IAM 權限，primary region 為 `asia-east1`，RPO 1 小時／RTO 4 小時
適用 database、whole-project 與 regional failure。仍須在 Stage 2 change plan
補最小 IAM、MFA、跨 project／region 復原、備份／PITR、監控告警、事件聯絡角色、
成本與演練；target 核准不是達標證據。

```text
核准內容／附件位置：
核准人姓名及職務：
核准日期（Asia/Taipei）：
```

---

## D-009｜Google Calendar 整合準備

**核准責任人：** 診所負責人＋資安負責人＋隱私負責人
**為什麼擋住階段 C：** 日曆事件會被很多人看到，放什麼進去必須先講清楚。

`GoogleCalendarClient`、最小投影與本機失敗演練已有程式碼／測試；尚未建立憑證、
部署 runner 或連上任何日曆。核准後仍須依 D-010 的環境與 Secret Manager 邊界
進行變更審核，不能把「client 已完成」誤當成已整合。

| 項目 | 核准答案 | 核准者 |
| --- | --- | --- |
| Calendar 業務擁有者 | `[診所角色]` | |
| 專用 Calendar 與帳號的管理方式 | `[專用日曆；不可在此填真實 ID]` | |
| 授權模型 | `[受控服務身分／使用者授權；理由]` | |
| 最小 OAuth scopes | `[逐項列出]` | |
| Calendar 投影欄位 | `開始／結束、busy 狀態、不可識別的關聯 ID；[其他]` | |
| 明確禁止欄位 | `姓名、電話、Email、病情、服務明細、病歷、附件、與會者、病患提醒` | |
| 建立／更新／取消事件的 outbox 行為 | `[事件類型與重試規則]` | |
| 重試門檻、死信與人工補救角色 | `[數值、責任人、聯絡流程]` | |
| 停用整合／撤銷權限／刪除投影流程 | `[流程]` | |

**兩件必須理解的前提：**

1. **Google Calendar 不是可預約時段的權威來源。** 即使同步失敗，已成立的預約
   仍以平台的資料庫與稽核狀態為準。櫃檯不得直接在 Calendar 建立未連結的預約。
2. **日曆事件不得包含姓名、電話、身分證或手術種類。** 這些足以揭露就醫關聯。
   目前設計只放預約編號與掛號別。

```text
核准內容／附件位置：
核准人姓名及職務：
核准日期（Asia/Taipei）：
```

---

## 合併簽核

```text
本次核准的決策編號：D-006 / D-010 / D-009
核准人及職務：
核准日期（Asia/Taipei）：
附件／佐證位置：
需要開發實作的後續事項：
```

## 核准後的界線

這三項核准**不解除**其他限制：

- 仍不得處理真實病患資料（需 D-001～D-003）。
- 仍不得對外開放公開預約網站（需 D-011 與 D-004、D-005）。
- 實際雲端部署仍需單獨的變更核准與回滾計畫。
- 階段 C 使用**專用測試日曆**，不得連任何醫師的私人日曆。
