# C2～C6 測試環境切片：RC 部署申請草稿

日期：2026-11-15（Asia/Taipei）。狀態：**草稿**。

**這是草稿，不是核准。** 每一片部署前，負責人必須針對該片明確同意；同意不延伸到其他片或未列出的項目。
**本文件不授權任何雲端操作**（gcloud、firebase、terraform、部署、讀回皆然）、不授權真實資料、production、
正式日曆、正式 DNS 或病患登入。依據：[RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md)第 15 行
（C2～C6 逐片提 request；做不到的片 11/22 前標明並移到 12 月）。（11/22 已處理：見本文件總表與 RC 計畫 10.4 負責人決定。）
欄位依 [執行手冊 §10.2](../product/full-project-execution-book-2026-07-31.md)（外部狀態變更申請）；
核准時另依[核准紀錄格式](../product/current-execution-and-approval-plan.md)留紀錄。

## 共用事項

- **目標環境**：隔離測試專案 `beauessence-clinic-stg-c1a01`（C2/C5/C6 於 2026-09-11 已 applied，
  見 [本機執行包](../runbooks/c2-c6-local-execution-packet.md) 第 8、16–18 行）。資料一律合成；
  資料分類：synthetic，另有 metadata（資源名稱、版本）。
- **為什麼要重做讀回**：first-stage 文件（[:44–103](../architecture/first-stage-c1-c6-execution.md)）把 C2／C5／C6 寫成 DEPLOYED，
  但 repo 內找不到部署的 commit SHA、容器 digest、apply 時間或 smoke 輸出。C3、C4 只有 source PASS，從未部署。
  因此每片第一步都是「唯讀讀回雲端現況」，缺的證據補進 repo。
- **部署版本**：一律「RC 候選 commit（凍結時填入）」。凍結前不得填入任何 SHA。
- **operator**：Claude（每一批經負責人明確同意後才執行）。**approver**：負責人。兩者不同人。
- **證據存放**：每片 smoke 與讀回輸出存成 `docs/reviews/` 新檔（建議 `docs/reviews/2026-11-NN-c<N>-rc-readback.md`），
  不得只放 /tmp。不貼金鑰、token、帳務識別碼、服務帳戶 JSON。
- **決定引用**：
  - APPROVAL-RC-2026-11-14（[決定登記](../product/phase-1-decision-register.md)開頭）：LEASE Gate 2 只接專用測試日曆、合成資料；
    CAL-PILOT 延到 2026-12-31。不授權部署、雲端操作或真實資料。
  - 2026-11-09 員工登入與七天 session 決定（同檔）：Google＋TOTP；員工 session 絕對 7 天、不因閒置登出
    （取代 12 小時）；敏感操作仍須 10 分鐘內 fresh Google＋TOTP。此決定不授權部署。
- **成本**：沒有帳單讀回的數字依據，各片一律「待 plan 與帳單讀回後填」。Terraform 各模組僅啟用 API／建立
  Firestore 資料庫與備份排程，Cloud Run 與容器另計；金額與單價查價日待填。
- **plan 預期資源**僅由程式碼推論，標「預期」；實際以 plan 輸出為準。
- **各模組預設**：`exact_apply_authority_sha` 不符時資源數為 0（no-op）；C2、C6 拒絕 `beauessence-clinic-staging`。

---

## C2 員工登入（Identity）

1. **目標與範圍**：獨立員工帳號、Google＋診所管理、MFA、停用於下一個請求生效（[first-stage :44–55](../architecture/first-stage-c1-c6-execution.md)）。
2. **排除項**：病患登入；真實員工個資；production；正式 DNS。
3. **前置與相依**：C1 讀回證據；C2 authority（first-stage 記為 granted，須在本申請核准時重確認）。
4. **部署內容**：Terraform `infra/terraform/c2-identity`（距 2026-09-11 變更 0 筆）；API 容器（`apps/api/src/auth/` 之後有 25 筆變更，故需重部署）。
   預期變動資源：`google_project_service`（Identity Platform API）；TOTP `adjacentIntervals=1` 由本機 C2 identity 腳本於 apply 後設定（模組不管）。版本：RC 候選 commit（凍結時填入）。
5. **讀回與驗收**：先唯讀讀回現在跑的 API revision／版本、Terraform state 與 plan 差異（預期無差異）；再部署；
   部署後 smoke（登入、MFA、停權下一請求被拒）存入 `docs/reviews/`。
6. **成本**：待 plan 與帳單讀回後填。
7. **operator**：Claude（每批經負責人明確同意）；**approver**：負責人。
8. **plan／apply**：（1）唯讀讀回；（2）在凍結 commit 上 plan，存 plan 與雜湊；（3）負責人核准該 plan；（4）apply（預期為 no-op 或極小）；（5）部署 API revision；（6）smoke 並寫證據。
9. **rollback**：Terraform 回前一個 state；Cloud Run 切回前一個 revision。
10. **風險與做不到的話**：風險低，屬「對照現況＋補讀回證據」，預估最輕。若讀回發現雲端與 repo 不符，停下回報，不自行修補；建議預設：標註差異，C3 以後順延。

## C3 Session 安全

1. **目標與範圍**：絕對 7 天、無閒置逾時（2026-11-09 決定）；敏感操作 10 分鐘 fresh Google＋TOTP；server-side session；`__session`＋CSRF；無共用緊急帳號（[first-stage :57–68](../architecture/first-stage-c1-c6-execution.md)）。
2. **排除項**：真實員工個資；真實 SDK 驗證（另核）；step-up TOTP（另排 12 月）；QR code 綁定；production。
3. **前置與相依**：C2 讀回證據；C3 authority。Firebase Hosting 只轉發 `__session`（硬限制）。
4. **部署內容**：無 Terraform；僅 API 容器。staff-session 之後有 3 筆變更，含 2026-11-09 的 68817285（七天 session）。預期變動：API Cloud Run 新 revision。版本：RC 候選 commit（凍結時填入）。
5. **讀回與驗收**：先讀回現在跑的版本（預期仍是 12 小時邏輯或從未部署）；部署後 smoke：合成帳號建立 session、確認 7 天到期欄位、停權即拒、登出撤銷、CSRF；證據存 `docs/reviews/`。
6. **成本**：待 plan 與帳單讀回後填。
7. **operator**：Claude（每批經負責人明確同意）；**approver**：負責人。
8. **plan／apply**：無 Terraform plan；步驟為（1）讀回；（2）核准該 commit 與容器 digest；（3）部署新 revision；（4）smoke；（5）寫證據。
9. **rollback**：Cloud Run 切回前一個 revision（已簽發的 7 天 session 回到舊版後行為須在讀回時確認）。
10. **風險與做不到的話**：七天 session 是 11/09 新決定，必須重新部署 API 才算數。真實 Identity SDK 驗證仍待另核（[packets :782](2026-11-08-phase1-rc-packets.md)）；
    本片只能宣告「stub／合成驗證」，不得宣稱真實 SDK 已驗。登入保留 7 天，櫃台電腦離座須鎖定（已知取捨）。建議預設：做不到時標明並移 12 月。

## C4 RBAC

1. **目標與範圍**：後端預設拒絕；manager 與 front_desk 分權；Calendar 衝突動作依角色（[first-stage :70–81](../architecture/first-stage-c1-c6-execution.md)）。
2. **排除項**：薪資、臨床、金流權限；真實資料；production。
3. **前置與相依**：C3 讀回證據；C4 authority。
4. **部署內容**：無 Terraform；API 容器（`packages/domain/src/roles.ts` 之後 1 筆變更）。**首次部署**。預期變動：API 新 revision。版本：RC 候選 commit（凍結時填入）。
5. **讀回與驗收**：讀回目前 API 無 RBAC 路由的事實；部署後 smoke：manager／front_desk 各自允許與拒絕案例，未知角色預設拒絕；證據存 `docs/reviews/`。
6. **成本**：待 plan 與帳單讀回後填。
7. **operator**：Claude（每批經負責人明確同意）；**approver**：負責人。
8. **plan／apply**：同 C3（無 Terraform）。
9. **rollback**：Cloud Run 切回前一個 revision。
10. **風險與做不到的話**：front_desk 與 manager 的衝突佇列權限問題仍開著（[first-stage :79](../architecture/first-stage-c1-c6-execution.md)），列為**殘餘風險**，不在本片解決。
    建議預設：以現行 deny-default 部署，衝突佇列維持較嚴格一方，待負責人另行決定；若 C3 未完成則本片隨之順延。

## C5 稽核（Firestore）

1. **目標與範圍**：append-only 稽核，涵蓋預約、營業時間、登入／停權、授權拒絕、Calendar 成功／失敗／衝突／覆核（[first-stage :83–93](../architecture/first-stage-c1-c6-execution.md)）。
2. **排除項**：真實資料；production 可連結性（D-002 未決）；真實保存期限；production。
3. **前置與相依**：C4 讀回證據；C5 authority；D-002 仍 pending（僅影響真實資料）。
4. **部署內容**：Terraform `infra/terraform/c5-firestore`（距 2026-09-11 變更 2 筆）；API／worker 容器（`audit.ts` 1 筆變更）。
   預期變動資源：`google_project_service`、`google_firestore_database`（Native、`asia-east1`、PITR、刪除保護）、
   `google_firestore_backup_schedule`（每日、保留 30 天）、`google_firestore_field`（匯出分塊 TTL）。版本：RC 候選 commit（凍結時填入）。
5. **讀回與驗收**：先讀回資料庫現況（位置、PITR、備份排程、TTL）、state 與 plan 差異（預期近乎無差異，那 2 筆變更須逐項對照）；
   部署後 smoke：合成事件寫入、append-only 不可改、拒絕案例有紀錄；證據存 `docs/reviews/`。
6. **成本**：待 plan 與帳單讀回後填。
7. **operator**：Claude（每批經負責人明確同意）；**approver**：負責人。
8. **plan／apply**：（1）唯讀讀回；（2）plan 並存雜湊；（3）負責人核准；（4）apply；（5）部署容器；（6）smoke。
9. **rollback**：Terraform 回前一個 state；Cloud Run 切回前一個 revision。**Firestore 資料類變更：schema／索引可回，資料不自動回**（刪除保護開啟，合成資料如需還原靠 PITR／備份，且不保證即時）。
10. **風險與做不到的話**：Terraform 幾乎未變，屬「對照現況＋補讀回證據」，預估最輕。若 plan 顯示要刪除或重建資料庫，**立即停止**並回報，不得 apply。建議預設：標明差異，改寫成修補申請。
11. **備份加強（負責人 2026-11-15 決定，見決定登記 BACKUP-B-2026-11-15）**：在既有每日備份（30 天）之外，新增每週備份排程（保留 14 週，Firestore 上限）與每月受管匯出到**專案外**的 Cloud Storage 儲存桶，保留 2 年，不設自動刪除；清除舊匯出前，先把較新的匯出還原到測試資料庫確認可用並留紀錄。屬新增雲端資源，須另寫 Terraform 並在 C5 窗口逐項核准；費用依匯出讀取次數與儲存量計，待讀回後填。

## C6 合成整合

1. **目標與範圍**：員工登入、RBAC、預約／班表、稽核、Calendar 雙向（watch＋補償＋衝突佇列）、網站轉址演練（無正式 DNS）（[first-stage :95–103](../architecture/first-stage-c1-c6-execution.md)）。
2. **排除項**：真實資料；production；正式 Hosting；正式 Calendar；掛載 `/v1/bookings` 公開寫入；正式 DNS；病患登入。
   依 APPROVAL-RC-2026-11-14，Gate 2 只接專用測試日曆、合成資料，CAL-PILOT 延到 2026-12-31。
3. **前置與相依**：C1～C5 讀回證據全齊；C6 authority。
4. **部署內容**：Terraform `infra/terraform/c6-calendar`；API 與 worker 容器（`apps/worker/` 之後 135 筆、`apps/api/` 205 筆變更）。
   預期變動資源：`google_project_service`（`calendar-json.googleapis.com`）；Cloud Run 新 revision（API、worker）。Calendar 監看（watch）控制器目前未掛載，是否接線須另核。版本：RC 候選 commit（凍結時填入）。
5. **讀回與驗收**：先讀回現況與 state／plan 差異；部署後 smoke：專用測試日曆合成事件雙向收斂、衝突進佇列、補償運作、booking 仍 UNROUTED；證據存 `docs/reviews/`。
6. **成本**：待 plan 與帳單讀回後填。
7. **operator**：Claude（每批經負責人明確同意）；**approver**：負責人。
8. **plan／apply**：同 C5，另加專用測試日曆授權與合成資料檢查；任何新 apply 需新的精確 SHA。
9. **rollback**：Terraform 回前一個 state（停用 API）；Cloud Run 切回前一個 revision；測試日曆上的合成事件手動清理。
10. **風險與做不到的話**：變動最大（容器自 9 月至今變更量大）。仍是 UNROUTED、合成資料、無正式 DNS。DATA-R03 codecs、D-009／D-016、D-004／D-005 對 production 仍未決，不因本片改變。
    **建議預設：11/22 若前五片（C1～C5）未完成就移 12 月。**

---

## 總表

| 片 | 首次或重部署 | 預估工作量 | 建議窗口日期 | 狀態 |
| --- | --- | --- | --- | --- |
| C2 | 重部署（對照現況＋補證據） | 輕 | 11/17 | 11/16 唯讀讀回：plan 無差異（[讀回](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)）；11/18 停權實測通過（[11/18 窗口](../reviews/2026-11-18-c1-window-c2-c6.md)）；部署與 smoke 待凍結版本；2026-11-20 盤點：11/22 建議留 RC（草稿見[RC 計畫](2026-11-08-phase1-rc-delivery-plan.md)第十節） |
| C3 | 重部署（七天 session 新版） | 中 | 11/18 | 11/16 已隨 main `df63bb85` 部署測試、session 7 天（[報告](../reviews/2026-11-16-c1-window-rc06-c3-c4.md)）；11/18 登出撤銷通過（[11/18 窗口](../reviews/2026-11-18-c1-window-c2-c6.md)）；7 日讀回 11/23 起，凍結版本重部署待排；2026-11-20 盤點：11/21 全程保護主管 7 天 session 不動（#537），11/22 建議留 RC（草稿） |
| C4 | 首次部署 | 中 | 11/18 | 11/16 已隨 main `df63bb85` 部署，主管角色實測通過；11/18 櫃台角色允許／拒絕通過（[11/18 窗口](../reviews/2026-11-18-c1-window-c2-c6.md)）；凍結版本重部署待排；2026-11-20 盤點：#534 取消畫面修正於 11/21 驗證（#537），11/22 建議核心留 RC、細分衝突佇列權限與 `audit.ts` claims 映射移 12 月（草稿） |
| C5 | 重部署（對照現況＋補證據） | 輕 | 11/17 唯讀讀回；11/18 C4 之後部署 | 11/16 唯讀讀回：plan 無差異；11/18 稽核筆數讀回通過（[11/18 窗口](../reviews/2026-11-18-c1-window-c2-c6.md)）；每週備份已寫 Terraform（#528）待 apply，每月外部匯出待決定位置；2026-11-20 盤點：#528 列 11/21 計畫第 5 節方案 A（#537），11/22 建議核心＋#528 留 RC、每月專案外匯出（2 年）移 12 月（草稿） |
| C6 | 重部署（變動最大） | 重 | 11/19–11/21 | 11/18 投影與補償通過；calendar-sync 回 500，同步收斂與衝突未證明（[11/18 窗口](../reviews/2026-11-18-c1-window-c2-c6.md)）；2026-11-20 盤點：11/19 已合 #532／#533（[長跑紀錄](../reviews/2026-11-19-gemini-long-run-record.md)），排入 [11/21 窗口計畫](2026-11-21-c1-window-plan.md)（#537）重測 2.3／2.4；11/22 建議條件式留 RC（視 11/21 結果決定 Gate 2 50 次去留；watch／故障注入／轉址移 12 月，草稿） |
