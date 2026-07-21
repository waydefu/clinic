# Phase 1 整合與公開上線核准包

**狀態：待核准。** 本文件覆蓋 D-009、D-010、D-011。它是外部整合與公開
網站的先決條件，不會建立雲端專案、不會部署、不會取得 OAuth 權杖，也不會
發送通知。

請先閱讀 [`../adr/0002-calendar-is-a-projection-not-the-lock.md`](../adr/0002-calendar-is-a-projection-not-the-lock.md)、
[`../runbooks/calendar-sync-failure.md`](../runbooks/calendar-sync-failure.md) 與
[`../../infra/terraform/README.md`](../../infra/terraform/README.md)。

## D-009 — Google Calendar 整合準備

| 項目 | 核准答案 | 核准者／證據 |
| --- | --- | --- |
| Calendar 業務擁有者 | `[診所角色]` | `[診所負責人]` |
| 專用 Calendar 與帳號的管理方式 | `[專用日曆；不得填入此文件的真實 ID]` | `[技術＋資安負責人]` |
| 授權模型 | `[受控服務身分／使用者授權；理由]` | `[資安負責人]` |
| 最小 OAuth scopes | `[逐項列出]` | `[資安負責人]` |
| Calendar 投影欄位 | `開始／結束、busy 狀態、不可識別的關聯 ID；[其他]` | `[營運＋隱私負責人]` |
| 明確禁止欄位 | `姓名、電話、Email、病情、服務明細、病歷、附件、與會者、病患提醒` | `[隱私負責人]` |
| 建立、更新、取消事件的 outbox 行為 | `[事件類型與重試規則]` | `[技術負責人]` |
| 重試門檻、死信與人工補救角色 | `[數值、責任人、聯絡流程]` | `[技術＋營運負責人]` |
| 停用整合／撤銷權限／刪除投影流程 | `[流程]` | `[技術＋資安負責人]` |

Calendar 不是可用時段權威來源。即使同步失敗，已成立的預約仍由平台的伺服器
交易與稽核狀態決定；不得由櫃檯直接在 Calendar 建立未連結的預約。

## D-010 — Firebase、環境與維運責任

| 項目 | 核准答案 | 核准者／證據 |
| --- | --- | --- |
| 環境分離 | `dev / staging / production；各自獨立帳務與資料` | `[技術＋資安負責人]` |
| Firebase／Google Cloud 所有權 | `[法人／持有角色；不得填入帳密]` | `[診所負責人]` |
| Firestore 資料位置與跨境評估 | `[核准位置與 D-002 證據]` | `[隱私＋資安負責人]` |
| IAM 與管理者帳號 | `[最小角色、MFA、定期覆核]` | `[資安負責人]` |
| 服務帳號、Secret Manager 與輪替 | `[最小權限與輪替流程]` | `[技術＋資安負責人]` |
| 備份、還原演練與保存 | `[RPO / RTO、頻率、責任人]` | `[技術＋營運負責人]` |
| 日誌、監控、告警與值班 | `[範圍、接收者、升級流程]` | `[技術＋資安負責人]` |
| 個資事件應變與對外聯繫 | `[runbook、聯絡角色、法律覆核]` | `[隱私＋資安負責人]` |
| IaC、部署與回滾核准 | `[CI/CD、變更審核、回滾擁有者]` | `[技術負責人]` |

所有環境都要維持 API-only Firestore 寫入；禁止直接從患者端、App、LINE、Meta
或 NAS 存取 Firestore。不可將真實 project ID、服務帳號金鑰、token、病患或薪資
資料提交到 repository。

## D-011 — 公開預約網站與人工備援

| 項目 | 核准答案 | 核准者／證據 |
| --- | --- | --- |
| 對外網域與頁面擁有者 | `[網域、DNS／內容管理責任人]` | `[診所負責人]` |
| 語言與可近用性需求 | `[繁中／其他；鍵盤、對比、螢幕閱讀器等]` | `[營運負責人]` |
| 病患登入或驗證方式 | `[依 D-006]` | `[資安＋營運負責人]` |
| 預約可用服務與時段呈現 | `[依 D-004]` | `[營運負責人]` |
| 隱私政策呈現與接受紀錄 | `[依 D-001～D-003]` | `[隱私負責人]` |
| 取消與改期入口 | `[依 D-005]` | `[營運負責人]` |
| 人工預約備援 | `[電話／櫃檯流程與服務時間]` | `[營運負責人]` |
| 無障礙或系統故障時的提示 | `[安全、不含個資的訊息與人工入口]` | `[營運＋技術負責人]` |
| Cookie、分析與第三方腳本 | `[預設不啟用；若需使用，另行隱私審核]` | `[隱私＋資安負責人]` |

公開頁面不可顯示或記錄病患資料於 URL、分析事件、前端錯誤工具或瀏覽器主控台。
Phase 1 仍不使用簡訊；任何 Email、LINE、Meta 或推播通知皆需另行核准並完成
資料最小化與供應商審查。

## 合併核准紀錄

```text
Decision IDs: D-009 / D-010 / D-011
Approved answers: [attach completed tables or approved architecture reference]
Approved by (clinic owner):
Approved by (technical owner):
Approved by (security owner):
Approved by (privacy/legal owner):
Approved by (operations owner):
Approval date (Asia/Taipei):
Evidence retained at:
Required implementation follow-up:
```

## 上線前的總門檻

這三項核准不會單獨解除安全限制。公開預約仍必須同時完成 D-001～D-006，並通過
本機交易、冪等、授權、稽核、Firestore Rules、備份還原與 Calendar 失敗演練。
實際雲端部署需要單獨的變更核准與回滾計畫。
