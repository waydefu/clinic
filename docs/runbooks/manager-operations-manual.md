# 管理者操作手冊（C1 合成測試版）

**適用對象：** 診所負責人與獲授權管理者。
**狀態：** source-guided 草稿；登入與預約路徑已有 source，C1 當前版本的逐項現場行為尚待部署後驗證。L3 UI 已隨 #216 merge head `1197f0c43a6a8fb1ed01960e01e9a59cac151656` 進入 main，該 exact-head CI 12/12 通過；L5 CP-07 API/domain source 已在先前 main 合併。下文依 source 的實際標籤描述操作；使用前仍須對合併 release 完成 C1 runtime／盲走。

目前 source release readback（2026-10-03）：main `6131c7fc54f09369842f6edf73a26d42fed4c729` 已包含 #214、#215、#216；其新 head CI 分別為 12/12 PASS。這份手冊仍是 source-guided 草稿，C1 runtime、popup 走查、CP-08 fresh captures、CP-10 簽署與 owner acceptance 尚未完成；後文較早的 candidate/unmerged 文字是歷史 snapshot。
**資料：** 目前只限 C1 synthetic test。請使用每次演練新建、完全虛構的姓名、電話、月日生日與預約；禁止真實病患、職員、行事曆、帳務或診療內容。不得用瀏覽器開發者工具、Postman 或自寫腳本繞過待完成的操作畫面。

本手冊不取代部署核准、隱私／法律審閱或正式合約。若畫面、按鈕、狀態和手冊不一致，停止該步驟並記下時間、畫面名稱與合成測試代號；不要試另一條路徑。

## 1. 登入工作臺

### 已有的登入方式（source 已有，部署與人工走查待驗證）

1. 使用核准的 C1 `internal-preproduction` Hosting 網址，開啟 `/staff`。先核對瀏覽器網址的主機屬於 isolated C1；不可用正式網站、`beauessence-clinic-staging` 或舊 `synthetic-review` 預覽。
2. 選「使用 Google 帳號登入」，登入已授權的員工身分，完成 TOTP 動態驗證碼。第一次建立 TOTP 後，依畫面重新使用 Google 帳號登入，再輸入 TOTP；完成雙因素驗證之前不會建立 staff session。
3. 登入後確認工作臺角色與權限正確。只有 manager 能查看核准的商務交付操作；`front_desk` 不能匯出或執行 CP-05 病患 lifecycle。遇到「帳號停用」、「需要重新登入」或 401／403，停止並請負責人檢查帳號，不換另一帳號代做。
4. 登入一次可用 12 小時，期間不會因為閒置自動登出（`STAFF-SESSION-12H-2026-10-03`）；確認里程碑、匯出、封存、刪除與終止仍會要求重新輸入動態驗證碼。因此人員離座時請鎖定電腦。
5. 離開共用電腦前，按「登出」，等待成功訊息，再重新載入確認仍在登入頁。登出錯誤時不要假設 session 已清除；停止使用該瀏覽器並回報。

**L3 重新驗證限制：** merged source 已有 fresh Google＋TOTP reauth bridge，#216 exact-head CI800/run `37051138728` passed 12/12；它仍尚未在 C1 真實 popup 走查。業主已決定 `COOP-POPUP-REAUTH-2026-10-03`：COOP 改為 `same-origin-allow-popups`，讓 popup 能回傳結果；須等含此設定的版本部署後才能走查。若 popup 被阻擋或沒有回到原操作，立刻停止。不要重複提交、複製 token、自行改 CSP／COOP、再放寬 security header，或改走未授權的 redirect／Console 路徑；source bridge 存在不代表 reauth 已通過。

## 2. 新增或管理預約

### 病患新預約

1. 開啟 `/booking`。病患預約不需要員工登入或 OTP。
2. 選服務、日期與可用時段，填寫新表單要求的姓名、電話、生日月日、本國／外國與預約備註（最多 120 字）；不輸入出生年、身分證／護照、健保卡意向、來源或介紹人資料。
3. 確認資料僅為本次合成測試，再送出。畫面顯示成功後記錄合成預約代號；重新載入頁面，然後由已登入的 Workbench 查看 server readback。瀏覽器畫面存在本身不是預約已保存證據。
4. 若送出失敗、沒有可預約時段、同一電話＋月日查到不唯一候選，或畫面內容與確認頁不同，停止；不要連續重送或猜另一個生日。

### 病患回診、取消或改期

1. 病患回診查詢使用電話＋月日生日，不用患者帳號、OTP 或自訂安全問題。唯一匹配才會繼續；沒有匹配或多筆可能匹配時顯示通用失敗，不會揭露候選人。
2. 依頁面顯示選取可管理的既有合成預約；逾取消時間、狀態已結束或時段無效時，依提示聯絡櫃台，不以重新整理或另開分頁繞過。
3. 櫃台／管理者在 `/staff` 的預約清單執行允許的取消、改期、報到或到診流程。只有授權角色可以把狀態設為 `completed`；`arrived` 不代表已完成。
4. Calendar 是預約系統的投影。Calendar 畫面不是可用時段或預約鎖；日曆投影失敗需依日曆同步 runbook 回報，不手動建立重複預約。

以上頁面與 API source 已存在；CP-02 既有 runtime 證據在舊 SHA。新聯絡欄位、備註和日曆標題仍須在本批 exact SHA 重新部署及逐列核對後才算本版本通過。

## 3. 查詢月用量與里程碑

**畫面說明：** merged L3 source 在 `/staff` 增加「商務與驗收」分頁，其中有「月用量」區塊、月份欄位與「查看月報」按鈕，以及「里程碑與驗收」區塊。尚未完成 C1 runtime 與盲走驗證，不能把 source CI 當成現場驗收。

1. 以 manager 登入 `/staff`，開啟「商務與驗收」分頁，選台北時間的月份。
2. 查看員工成功登入與預約成功建立的彙總，以及觀測完整度和分類。C1 synthetic events 可用來驗證 runtime／maintenance 分類邏輯；這種測試不能單獨作正式財務用量證據，也不能概括為所有 synthetic 類事件一定排除在正式月報之外。只有正式政策確認、事件完整且員工登入 AND 預約建立都為零，才可判為 `unused`。缺漏或觀測時間不足顯示 `insufficient_evidence`，由負責人與維護方人工核對，不當零使用月。
3. 在「里程碑與驗收」區檢查 evidence reference、目前狀態與版本。若項目等候確認，候選 UI 會顯示「重新登入並確認正式上線日」或「重新登入並確認尾款」按鈕；只有政策差異由 owner 解決、正確里程碑經核准且 reauth popup 通過後，才由具名負責人確認。server receipt 會記錄操作者與時間。缺 evidence 時保持 blocked，不以畫面按鈕或經過的天數代替確認。
4. 本地 Decision Register 所列測試期為 20 個台北日曆天（含起算日）加最多 10 天調整；本地付款政策另要求真實資料正式開放後滿一個日曆月並由負責人確認。這些付款／試用條款正待 CP-09 與現行 Drive 文件 reconciliation（見 CP-10）；在 owner 解決差異前，不用本畫面產生帳單、承諾金額或認定付款條件已達成。

## 4. 匯出 CSV

**畫面說明：** L3 source 的「預約 CSV 匯出」區有起訖日期欄、欄位說明與「重新登入並建立匯出」按鈕；建立後顯示匯出卡片，提供「查詢狀態」、「下載 CSV」和「撤銷匯出」。source CI 已通過，但尚未完成 C1 runtime 驗證；CP08 成功前不要操作或改用 API client。

1. manager 登入 `/staff`，在「預約 CSV 匯出」選起訖台北日期並確認欄位說明。格式固定為 CSV；本期不提供 XLSX。
2. 開始產檔前重新以 Google＋TOTP 驗證。重新驗證須屬同一登入者且在 10 分鐘內。逾時、視窗不回應或再次登入變成別人時，取消流程並回報；不要複製或儲存 token。
3. 產檔狀態為 ready 後，仍在登入後的 Workbench 下載。白名單欄位是姓名、電話、生日（月-日）、國籍、預約時間、初診／回診、服務、狀態、備註；病歷及稽核資料不得匯出。沒有的舊資料值留空，不推算、不從 hash 還原。
4. 下載最多 3 次、24 小時失效；伺服器檔案最長 7 天後清除。若要提供診所工作檔，依核准流程由業主本人下載後放到其受控 Google Drive；本服務不寄 email、不產生公開分享網址、也不替使用者上傳 Drive。
5. 檢查 CSV UTF-8 中文、日期、開頭為 0 的電話與欄位可讀性。僅在完成檔案檢查後通知負責人；若欄位超出清單、資料列不是本次 synthetic fixture、下載被重用或檔案不可讀，停止並回報。

## 5. 封存、復原、法律保留與永久刪除

**畫面說明：** L3 source 的「封存與保存管理」包含「待永久刪除清單」；清單只顯示不透明患者識別值、封存時間、可復原期限與 legal hold 狀態，不顯示患者姓名。表單有「重新登入並封存」、「復原封存患者」、「更新 legal hold」與「重新登入並永久刪除」；永久刪除另要求勾選「我確認永久刪除此患者資料」。尚未完成 C1 runtime／盲走驗證，涉及病患資料及不可逆操作，沒有本次 synthetic fixture 的明確 owner approval 時不操作。

CP-05 API 只接受單筆患者識別值；沒有 preview 或 fingerprint endpoint，也沒有 hash-bound confirm contract。表單確認勾選不能替代核對單一患者、權限與操作範圍。沒有經驗收的正式 UI、exact synthetic record 與完整前後讀回時停止，不改用 API client。

1. **封存：** 由負責人核准一筆合成記錄與範圍。候選表單只收不透明患者識別碼，沒有 preview/fingerprint；必須先在同一核准 release 的受驗收 Workbench 讀回該 synthetic record 與其預約，確認沒有未來 `confirmed`／`arrived` 預約，否則停止。source 要求封存動作有 fresh Google＋TOTP。若畫面不能讓操作者把唯一對象對到本次核准並核對 30 日可復原期限，就不要執行。
2. **復原：** 在封存後 30 日內，由 manager 核對同一合成記錄後申請復原。source contract 不要求此動作 fresh reauth；仍須 manager 登入並在畫面確認。已到期記錄不能復原；復原不會重啟已撤銷登入 session。沒有已驗證畫面時停止。
3. **Legal hold：** 由有 `manage_business_retention` 權限的 manager，依已核准理由及範圍設定或解除；source contract 不要求此動作 fresh reauth。確認狀態讀回；有 hold 的資料不可永久刪除。權限或讀回不明時停止。
4. **永久刪除：** 不會自動發生。只可在封存滿 30 天、無 legal hold、依存關係已對帳、reason code 屬核准選項時，對另行核准的 exact synthetic record 重新 Google＋TOTP 後執行。UI 候選提供患者識別欄、原因與確認勾選，但 source 沒有 preview/fingerprint 確認步驟；沒有正式 UI 的單一對象核對與本次範圍核准前，禁止操作。不得用「全部」選擇或擴大 scope。
5. 執行後按回傳結果確認患者及預約狀態；audit 記錄與備份／PITR 依政策保留，因此不可宣稱所有副本已即時刪除。還原備份時須依核准流程處理既有刪除紀錄。操作未完成、任何層 partial 或出現 hold 時保持未結，不重複操作、不把失敗改標 complete。

**本節所有 destructive synthetic 操作均另需精確範圍 owner approval。不可套用至真實病患或 production。**

## 6. 合作終止與資料返還收據

**候選畫面：** L3 source 的「合作終止與資料返還」區含台北通知日期與「重新登入並開啟終止通知」；「載入合作個案」欄位；收據種類「資料返還」、「備份處置」、「稽核紀錄處置」、「帳號權限撤銷」；資料返還欄位「已簽收匯出識別碼」，其他收據使用「人工核對證據編號」；並提供「重新登入並記錄確認」及「重新登入並送交結案審查」。個案畫面顯示通知日、通知期起迄、受控保留期限、狀態、就緒／缺項與收據。L3 UI 在 PR #216 head `91da1cce…`；gate-fix commit `c1658660` passed 32 focused tests and independent review, and CI800/run `36853002771` passed 12/12. PR READY, unmerged/undeployed; designated Claude review and owner merge remain pending. L5 CP-07 API/domain source is PR #213 head `e517f387…`; CI799/run `36852875693` passed 12/12. PR READY, unmerged/undeployed. These are candidate source UI controls, not accepted release behavior; C1 runtime and blind walk remain pending.

1. 確認負責人已批准終止範圍，先建立 30 日通知。notice 起算後，在法定／約定到期日之前不可進入結案步驟；建立通知不等於立即終止服務。
2. 通知期屆滿後，依已核准程序交付資料。負責人實際檢查已交付檔案後登記 data-return receipt；source 綁定先前建立且仍有效的匯出檔案 ID，系統記錄檔案 hash、時間及操作者。單純下載不等於收件確認。
3. 記錄 receipt 後，受控副本保留期才開始計算 30 日。backup、audit、access 三種 receipt 是負責人的處置聲明；它們不證明雲端備份已刪、稽核紀錄已刪或帳號權限已撤銷。相關實際處置須另外執行並保留受控證據。
4. 所有要求步驟與期限完成後，提交 close review。系統只可轉為 `manual_close_review`，表示等待人工檢視；不代表合作已終止、服務已停用、資料已刪除或存取權已撤銷。缺少任何 receipt、期限未到或 version 不符時 close 應拒絕；不可當日通知並同日正向結案。
5. PR #213 中每一個寫入動作都要求該操作者 fresh Google＋TOTP；若重新驗證失敗或超出 10 分鐘，停止並重新登入驗證。正式使用前還需要 CP-09 文件同步、專業審閱、CP-08 實測與另行授權。

## 7. 截圖清單（目前全為空白 placeholder）

下列表格是未來 fresh synthetic capture 的完整清單。本 repository 不含本次部署的畫面，所以不附假截圖。各檔名在 C1 runtime 操作當天由 reviewer 親自擷取；每張都需去識別 manifest 連結至 exact source SHA、Hosting version、browser／viewport、UTC 時間與 synthetic fixture reference。

| 預定檔名 | 必須呈現的狀態 | 遮蔽／禁止內容 |
| --- | --- | --- |
| `manager-01-login-google-totp.png` | C1 `/staff` Google + TOTP 登入畫面 | email、帳戶選擇內容、驗證碼、token |
| `manager-02-workbench-session.png` | manager session 建立後的工作臺入口與角色 | staff email／UID、session cookie、真人名稱 |
| `manager-03-booking-form.png` | `/booking` 只含姓名、電話、生日月日、國籍、服務、時間和備註的合成表單 | real-looking personal data、完整生日年份、憑證 |
| `manager-04-booking-server-readback.png` | 成功畫面與對應 server readback 的合成預約代號 | request headers／tokens、真 Calendar ID |
| `manager-05-monthly-usage.png` | 候選「商務與驗收」分頁的「月用量」、月份欄與「查看月報」；完整／不足證據兩種狀態 | 真實登入事件／信箱、未核准金額或付款 claim |
| `manager-06-milestone-receipt.png` | 候選「里程碑與驗收」待確認／receipt 狀態；只在 policy 差異解決後測試確認操作 | reauth token、真 owner signature 或未核准 milestone |
| `manager-07-export-request-reauth.png` | 候選「預約 CSV 匯出」日期範圍、欄位清單與 fresh reauth 提示 | Google email、TOTP、reauth token |
| `manager-08-export-download-check.png` | 候選匯出卡的「下載 CSV」與已授權下載之單筆合成檔案的可讀性檢查；不假設 Workbench 有 CSV preview | 真實個資、病歷、稽核資料、完整匯出檔複本 |
| `manager-09-archive-form.png` | 候選「封存與保存管理」表單中的不透明 patient ID 欄與「重新登入並封存」；不是 scope preview/fingerprint | 真患者 ID／姓名／電話／生日 |
| `manager-10-restore-result.png` | 30 日內成功復原後的安全狀態讀回 | 真實記錄、session cookie |
| `manager-11-legal-hold.png` | 負責人設定 hold 與永久刪除阻擋狀態 | 法律個案內容或非 synthetic 患者資訊 |
| `manager-12-permanent-delete-confirm-result.png` | 合成記錄、核准範圍、理由代碼及分層結果 | 真實病患、私有 reauth token、任何未授權 scope |
| `manager-13-termination-notice.png` | 候選「合作終止與資料返還」台北通知日期與 30 日通知狀態 | 真合作資料、真 owner 身分 |
| `manager-14-termination-data-return-receipt.png` | 合成 export 的收件 receipt 與 server 記錄時間/hash | CSV 全文、Drive ID/連結、真 owner 身分 |
| `manager-15-termination-controlled-retention.png` | receipt 後 30 日受控保留期限及未完成項目 | 真合作資料、私有證據連結 |
| `manager-16-termination-manual-close-review.png` | 屆期、receipt 齊全後的 `manual_close_review`（不是已結束狀態） | 真合作資料、未公開權限／刪除證據 |

每次重新部署／SHA 變更都必須重拍受影響情境；舊版 UI 截圖不能充當新 SHA runtime evidence。只在所有安全檢查通過後才把去識別圖片納入後續經審核的文件變更；本次 placeholder 不可替代 CP08 或業主簽署。

## 附錄 A：source contract 與技術操作界線（非診所日常操作步驟）

以下 route 僅供工程／驗收人員對照 source，不代表診所可直接呼叫；正式操作仍須透過驗收後的 UI。除特別標明外，所有 POST 仍需有效 staff session、CSRF 和授權角色。

| 功能 | source contract | Reauth 與限制 |
| --- | --- | --- |
| CP-03 月用量 | `GET /v1/business-delivery/monthly-usage?month=YYYY-MM`；`GET /v1/business-delivery/milestones`；`POST /v1/business-delivery/milestones/:milestoneId/acknowledgements` | acknowledgement POST 需 fresh Google＋TOTP，header `x-reauth-id-token`；10 分鐘有效；仍需 session/CSRF。 |
| CP-04 CSV | `POST /v1/business-delivery/exports`；`GET /v1/business-delivery/exports/:exportId`；`GET /v1/business-delivery/exports/:exportId/download`；`POST /v1/business-delivery/exports/:exportId/revoke` | Create POST requires 10-minute fresh reauth (`x-reauth-id-token`) plus session/CSRF/manager scope. Download rechecks manager/scope/status/expiry each time but has no fresh-reauth header; revoke is session/CSRF/manager guarded and idempotent. |
| CP-05 retention | `POST /v1/business-delivery/retention/archive`、`restore`、`legal-hold`、`permanent-delete`；`GET /v1/business-delivery/retention/pending-deletion` | POST request 有 `idempotencyKey` 與單一 `patientId`；permanent-delete 加 `reasonCode`；legal-hold 加 `hold` 和 `reasonCode`。Archive/permanent-delete 要求 10 分鐘內 fresh Google＋TOTP (`x-reauth-id-token`)；restore/legal-hold 不要求 reauth。session/CSRF/manager permission 均需；沒有 preview/fingerprint endpoint。 |
| CP-07 termination | `POST /v1/business-delivery/terminations`；`GET /v1/business-delivery/terminations/:terminationId`；`POST /v1/business-delivery/terminations/:terminationId/acknowledgements`；`POST /v1/business-delivery/terminations/:terminationId/close` | 每個 POST 均需 session/CSRF、manager permission 與 10 分鐘內 fresh Google＋TOTP，header `x-reauth-id-token`。Notice body `{idempotencyKey, noticeDate}`；data-return body `{idempotencyKey, receiptKind:"data_return", exportId}`；其他 receipts 分別用 `receiptKind:"backup_disposition" | "audit_disposition" | "access_revocation"` 加 `evidenceRef`；close body `{idempotencyKey, expectedVersion}`，只能導向 `manual_close_review`。 |

PR #213 contract 定義通知期 30 日，以及 data-return receipt 登記後 controlled-copy retention 30 日。時間未到或 evidence 不齊全時不可 close；HTTP contract 拒絕不應由人工繞過。
