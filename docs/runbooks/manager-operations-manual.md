# 管理者操作手冊（C1 合成測試版）

**適用對象：** 診所負責人與獲授權管理者。
**狀態：** source-guided 草稿；登入與預約路徑在程式已有實作，C1 當前版本的逐項現場行為尚待部署後驗證。商務用量、CSV、保存與合作終止功能目前沒有完整 Workbench 畫面；下文將未完成的按鈕／畫面明確標為「待程式與 runtime 驗證」，不可把 API 已存在當成可以直接使用。
**資料：** 目前只限 C1 synthetic test。請使用每次演練新建、完全虛構的姓名、電話、月日生日與預約；禁止真實病患、職員、行事曆、帳務或診療內容。不得用瀏覽器開發者工具、Postman 或自寫腳本繞過待完成的操作畫面。

本手冊不取代部署核准、隱私／法律審閱或正式合約。若畫面、按鈕、狀態和手冊不一致，停止該步驟並記下時間、畫面名稱與合成測試代號；不要試另一條路徑。

## 1. 登入工作臺

### 已有的登入方式（source 已有，部署與人工走查待驗證）

1. 使用核准的 C1 `internal-preproduction` Hosting 網址，開啟 `/staff`。先核對瀏覽器網址的主機屬於 isolated C1；不可用正式網站、`beauessence-clinic-staging` 或舊 `synthetic-review` 預覽。
2. 選「使用 Google 帳號登入」，登入已授權的員工身分，完成 TOTP 動態驗證碼。第一次建立 TOTP 後，依畫面重新使用 Google 帳號登入，再輸入 TOTP；完成雙因素驗證之前不會建立 staff session。
3. 登入後確認工作臺角色與權限正確。只有 manager 能查看核准的商務交付操作；`front_desk` 不能匯出或執行 CP-05 病患 lifecycle。遇到「帳號停用」、「需要重新登入」或 401／403，停止並請負責人檢查帳號，不換另一帳號代做。
4. 離開共用電腦前，按「登出」，等待成功訊息，再重新載入確認仍在登入頁。登出錯誤時不要假設 session 已清除；停止使用該瀏覽器並回報。

**L3 重新驗證限制：** 敏感操作的 reauth UI 仍待完成與實機走查。現在 C1 response policy 含 `Cross-Origin-Opener-Policy: same-origin`；若新 Google＋TOTP popup 被阻擋或沒有回到操作畫面，立刻停止。不要重複提交、複製 token、改 CSP／COOP、改成較寬的安全標頭，或改走未授權的 redirect／Console 路徑。由產品／資安 owner 與實作者先作明確 source/runtime 決定，再安排 L3 修補與回歸。

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

**Workbench 商務頁面：待 CP-03 UI source／runtime 驗證。** 目前 API source 有下列管理者路由，但 C1 Cloud Run Terraform baseline 尚未傳入完整 `BUSINESS_DELIVERY_*` 設定，功能應 fail closed；請勿直接用網址列、瀏覽器 console 或 API client 手動呼叫。

預計畫面完成後：

1. 以 manager 登入 `/staff`，開啟「商務與驗收」分頁，選台北時間的月份。
2. 查看員工成功登入與預約成功建立的彙總，以及 coverage／分類。合成、測試、開發、維護事件不算正式使用；只有事件資料覆蓋完整且員工登入 AND 預約建立都為零，才能是 `unused`。缺漏或觀測時間不足顯示 `insufficient_evidence`，由負責人與維護方人工核對，不當零使用月。
3. 打開里程碑卡片，檢查每個 evidence reference、目前狀態與版本。對需人確認的項目，先重新 Google＋TOTP，再由具名負責人確認；server 會留下操作者、時間及不可改寫的紀錄。缺 evidence 時保持 blocked，不以畫面按鈕或經過的天數代替確認。
4. 本地 Decision Register 所列測試期為 20 個台北日曆天（含起算日）加最多 10 天調整；本地付款政策另要求真實資料正式開放後滿一個日曆月並由負責人確認。這些付款／試用條款正待 CP-09 與現行 Drive 文件 reconciliation（見 CP-10）；在 owner 解決差異前，不用本畫面產生帳單、承諾金額或認定付款條件已達成。

Source 路由（不是目前可供一般使用者操作的介面）：`GET /v1/business-delivery/monthly-usage?month=YYYY-MM`、`GET /v1/business-delivery/milestones`、`POST /v1/business-delivery/milestones/:milestoneId/acknowledgements`。所有 POST 同時需要有效員工 session、CSRF 和符合條件的 fresh reauth；只允許核准角色。

## 4. 匯出 CSV

**Workbench 匯出畫面：待 CP-04 UI source／runtime 驗證。** 在正式操作介面出現且 CP08 成功之前，請勿嘗試 API 匯出。

預計已驗證的畫面流程：

1. manager 登入 `/staff`，在「匯出」選起訖台北日期並確認欄位說明。格式固定為 CSV；本期不提供 XLSX。
2. 開始產檔前重新以 Google＋TOTP 驗證。重新驗證須屬同一登入者且在 10 分鐘內。逾時、視窗不回應或再次登入變成別人時，取消流程並回報；不要複製或儲存 token。
3. 產檔狀態為 ready 後，仍在登入後的 Workbench 下載。下載內容限姓名、電話、生日月日、國籍、預約時間、類別、服務、狀態及核准的備註；沒有的舊資料值留空，不推算、不從 hash 還原。
4. 下載最多 3 次、24 小時失效；伺服器檔案最長 7 天後清除。若要提供診所工作檔，依核准流程由業主本人下載後放到其受控 Google Drive；本服務不寄 email、不產生公開分享網址、也不替使用者上傳 Drive。
5. 檢查 CSV UTF-8 中文、日期、開頭為 0 的電話與欄位可讀性。僅在完成檔案檢查後通知負責人；若欄位超出清單、資料列不是本次 synthetic fixture、下載被重用或檔案不可讀，停止並回報。

API source（仍須 C1 runtime 驗證）：`POST /v1/business-delivery/exports`，body 固定為 `idempotencyKey`、`format:"csv"`、`from`、`to` 並帶 `x-reauth-id-token`；`GET /v1/business-delivery/exports/:exportId` 查狀態；`GET /v1/business-delivery/exports/:exportId/download` 下載；`POST /v1/business-delivery/exports/:exportId/revoke` 撤銷。每個要求均受 manager RBAC、session 與 scope 檢查。

## 5. 封存、復原、法律保留與永久刪除

**Workbench lifecycle 畫面：待 CP-05 UI source／runtime 驗證。** CP-05 API source 有既定路由，但涉及病患資料及不可逆操作；沒有負責人對本次 synthetic fixture 的明確執行核准、可靠 UI 和完整前後讀回時，不操作。

已記錄的 C1 來源流程如下：

1. **封存：** 經理確認唯一 synthetic patient 及其全部預約；先檢查是否有未來 `confirmed`／`arrived` 預約。有此類預約時不能封存。封存前重新 Google＋TOTP；核對畫面列出 30 天可復原期限及會受影響的 appointment 數。按下確認後讀回該患者已從可查預約與回診 lookup 排除。
2. **復原：** 在封存後 30 天內選取該 synthetic patient，核對預覽再復原；此操作不要求 fresh reauth，但仍需 manager session、CSRF 與清楚確認。已到期紀錄不能復原；復原不會重啟已撤銷登入 session。
3. **Legal hold：** 僅診所負責人可建立或解除。選擇明確理由／範圍，確認狀態讀回；有 hold 的資料不可進永久刪除。若登入角色是否為負責人尚未經確認，停止並請負責人處理。
4. **永久刪除：** 不會自動發生。只能在封存已滿 30 天、無 legal hold、依存關係已對帳、reason code 有效時，由核准的負責人重新 Google＋TOTP，輸入關閉清單內理由並確認 exact synthetic record。執行前再次核對預覽的數量和指紋；與預覽不一致、數量不是明確核准值或出現「全部」選擇時取消。
5. 執行後核對 active patient、預約、lookup index 等層的結果；`audit_events`、BD audit 記錄與備份／PITR 依規則保留，不代表已即時刪除全部副本。還原備份時須重套已核准刪除紀錄。操作未完成、任何層 partial 或出現 hold 時保持未結，不重複操作、不把失敗改標 complete。

API source routes：`POST /v1/business-delivery/retention/archive`、`POST /v1/business-delivery/retention/restore`、`POST /v1/business-delivery/retention/legal-hold`、`POST /v1/business-delivery/retention/permanent-delete`、`GET /v1/business-delivery/retention/pending-deletion`。封存及永久刪除需要 `x-reauth-id-token`；復原與 legal hold 依 source contract 不要求 reauth。全部仍需登入 session／CSRF／manager permission；永久刪除與實際 synthetic 資料操作還需另外的精確範圍 owner 核准。**不可套用至真實病患或 production。**

## 6. 合作終止與資料返還收據

**CP-07 case、收據畫面與完整 runtime：待 source PR、UI 及 CP08 驗證。** 現行 baseline 沒有 termination controller／case API，不應把下述流程當作已可執行按鈕。

1. 依負責人核准的終止範圍建立待辦：資料匯出、交付人／收件人、權限撤銷項目、需保留副本與期限、各層刪除／自然到期證據。費用結清由人處理；系統不自動扣款或以結清狀態阻擋返還。
2. 匯出完整性驗證後，把匯出 artifact hash、文件版本、受控範圍和交付時間綁到 termination case；不得在公開 repository 保存 CSV 或完整個資。
3. 診所負責人使用自己已登入的工作臺檢查收件檔，按「已收到」並重新驗證（若未來 UI 要求）。收據記錄負責人身分參照、UTC 時間、檔案 SHA-256 與 case ID；檔案下載成功不等於已簽收。
4. 只有收件 receipt、controlled copy 保存期、員工／開發者權限處置及所有資料層的 evidence 都齊備，server 才可允許 case close。失敗、不同 hash、legal hold、備份未到期或 partial status 都維持 open，記明責任人和下一步。
5. 不在本手冊操作真實合作終止、停用服務、撤銷真實人員帳號或永久刪除 production data。正式使用前還需要 CP-09 文件同步、專業審閱與另行授權。

待交付 API 位置以 CP-07 source contract 為準；目前沒有可供診所使用的 termination route。不能用 CP-04 匯出 route 或一般「儲存」按鈕假裝已簽收。

## 7. 截圖清單（目前全為空白 placeholder）

下列表格是未來 fresh synthetic capture 的完整清單。本 repository 不含本次部署的畫面，所以不附假截圖。各檔名在 C1 runtime 操作當天由 reviewer 親自擷取；每張都需去識別 manifest 連結至 exact source SHA、Hosting version、browser／viewport、UTC 時間與 synthetic fixture reference。

| 預定檔名 | 必須呈現的狀態 | 遮蔽／禁止內容 |
| --- | --- | --- |
| `manager-01-login-google-totp.png` | C1 `/staff` Google + TOTP 登入畫面 | email、帳戶選擇內容、驗證碼、token |
| `manager-02-workbench-session.png` | manager session 建立後的工作臺入口與角色 | staff email／UID、session cookie、真人名稱 |
| `manager-03-booking-form.png` | `/booking` 只含姓名、電話、生日月日、國籍、服務、時間和備註的合成表單 | real-looking personal data、完整生日年份、憑證 |
| `manager-04-booking-server-readback.png` | 成功畫面與對應 server readback 的合成預約代號 | request headers／tokens、真 Calendar ID |
| `manager-05-monthly-usage.png` | 完整／不足證據兩種用量狀態，使用固定 synthetic fixtures | 真實登入事件／信箱、未核准金額或付款 claim |
| `manager-06-milestone-receipt.png` | 等待確認及完成後 receipt 狀態 | reauth token、真 owner signature 或未核准 milestone |
| `manager-07-export-request-reauth.png` | CSV 日期範圍、欄位清單與 fresh reauth 提示 | Google email、TOTP、reauth token |
| `manager-08-export-csv-preview.png` | 合成 CSV 表頭、格式與一筆可讀 fixture | 真實個資、病歷、稽核資料、檔案內容完整複本 |
| `manager-09-archive-preview.png` | one-patient exact scope、預約數與可復原期限 | 真患者 ID／姓名／電話／生日 |
| `manager-10-restore-result.png` | 30 日內成功復原後的安全狀態讀回 | 真實記錄、session cookie |
| `manager-11-legal-hold.png` | 負責人設定 hold 與永久刪除阻擋狀態 | 法律個案內容或非 synthetic 患者資訊 |
| `manager-12-permanent-delete-confirm-result.png` | 合成記錄、核准範圍、理由代碼及分層結果 | 真實病患、私有 reauth token、任何未授權 scope |
| `manager-13-termination-receipt.png` | synthetic artifact hash、case 狀態、收件確認與時間 | Drive ID/連結、真 owner 身分、完整匯出檔 |

每次重新部署／SHA 變更都必須重拍受影響情境；舊版 UI 截圖不能充當新 SHA runtime evidence。只在所有安全檢查通過後才把去識別圖片納入後續經審核的文件變更；本次 placeholder 不可替代 CP08 或業主簽署。
