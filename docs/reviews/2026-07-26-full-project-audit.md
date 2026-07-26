# 全專案審查與後續處理（2026-07-26）

一次涵蓋全庫的審查，接著就地處理其中三項。這份文件記錄**當時查到什麼、依據是
什麼、處理了什麼、還剩什麼**。所有數據都來自當天實跑，不是引用其他文件。

## 1. 當天實跑的證據

| 指令 | 結果 |
| --- | --- |
| `corepack pnpm verify` | exit 0 — 39 檔／469 單元測試（處理後為 41 檔／487） |
| `corepack pnpm test:e2e` | 97 passed |
| `corepack pnpm test:rules` | 6 檔／62 tests（Emulator） |
| `corepack pnpm verify:preview` | 395/395 —— 打線上預覽站的**實際回應標頭** |
| `corepack pnpm run sbom` | CycloneDX 1.6，921 元件／80 runtime，授權 gate 過 |
| 全庫 `TODO`／`FIXME`／`@ts-ignore`／`as any` | 0 |
| 全庫 `.skip`／`.only`／空洞斷言 | 0 |

## 2. 查到的問題

### 2.1 署徽的使用權從未被評估（新發現，處理中止於「待負責人決定」）

患者頁顯示健保署署徽。專案文件對它的討論**全部是影像預算與不得變形**這類渲染
問題，`phase-1-decision-register.md` 的 D-001～D-011 沒有任何一條涉及標章授權。

衛福部明載健保 logo 已申請商標權、冒用須負損害賠償責任，健保署另有《使用全民
健康保險標誌注意事項》。診所若為特約機構，正式站顯示屬正當；問題在於它目前出現
在一個標題寫「測試版本」、任何人拿到連結就能開的 `*.web.app` 預覽站上。

**這不是工程能自行決定的事項。負責人當日決定：知情保留**（三個選項中的 C），
記於 D-012。那是「看過風險後選擇留著」，**不是「已確認合規」**——沒有人比對過
健保署的使用注意事項，那件事仍欠在正式網域上線前完成，屆時 D-012 必須重看。
本次沒有更動任何資產。

### 2.2 公開預覽站的根路徑就是櫃台工作臺

未帶任何憑證請求預覽站根路徑會得到 HTTP 200 的工作臺，HTML 內含合成登入閘門，
而**明碼帳號就在同一份 HTML 裡**。Firebase preview channel 沒有存取控制。

衝擊有界：沒有後端、沒有共用狀態，每位訪客只操作自己瀏覽器裡的合成資料。這與
AUTH-001 記載的「非安全邊界」一致，維持現狀；`synthetic-online-preview.md` 的
「只准合成資料」是這件事唯一的實質防線，頻道也維持 7 天到期。

### 2.3 公開網址收集身分證字號

已有的防護比預期強，且都經過實查：`apps/web/public` 全樹**沒有任何**
`fetch`／`XMLHttpRequest`／`sendBeacon`／`WebSocket`，CSP 亦為 `connect-src 'self'`
——資料在技術上不可能離開裝置；送出前必須勾選「我了解此頁為測試版本」；清單一律
遮罩；稽核契約在型別上沒有欄位可放 PII；日曆匯出只帶診所名、掛號別、時間與地址。

缺口是個資法第 8 條的告知（機構名稱、蒐集目的、個資類別、利用之期間／地區／
對象／方式、當事人權利與行使方式）、保存期限與使用者可自行清除的路徑。因為診所
端從未收到資料，「蒐集」可主張尚未發生，因此這是**上線前要關掉的缺口，不是現在
的違法狀態**，隨 D-001～D-003 一起處理。

### 2.4 已處理的三項

見下一節。

## 3. 這次處理了什麼

### 3.1 相依安全閘門分成出貨面與工具面

先前是單一 `pnpm audit --audit-level high`。三筆 moderate 早已在
`pnpm-workspace.yaml` 逐筆覆核並寫下解除條件——**那不是疏忽**；真正的缺口是閘門
不分出貨面與工具面，今天若有一筆 moderate 長在 production 相依上，一樣不會擋。

`check:supply-chain` 因此改成依序跑兩層：

- `audit:prod`（`--prod --audit-level moderate`）：出貨面，moderate 就擋
- `audit:all`（`--audit-level high`）：含 dev 工具鏈，high 才擋

為什麼不是單一門檻，寫在 `pnpm-workspace.yaml` 的註解裡：全部拉到 moderate 會被
firebase-tools 的傳遞相依長期壓紅，最後整條 audit 會被關掉或被 ignore 洗到失效。

### 3.2 患者身分模型進 domain

先前身分規則（格式、正規化、比對鍵、遮罩）**只存在於瀏覽器**，`packages/domain`
對「患者是誰」一無所知。那代表 API 上線時同一組規則要再寫一次，而事實上的規格
會是那份不會出貨的瀏覽器程式。

新增 `packages/domain/src/patient-identity.ts`：`patientIdentityIssues`（回
`{ field, code }`，不做在地化）、`normalisePatientIdentity`、`patientIdentityKey`、
`maskNationalId`。`apps/web/public/modules/patient-registry.js` 縮成在地化與狀態
存取層。

搬移過程修掉一個真缺陷：`new Date('1990-02-31T00:00:00+08:00')` 不會失敗，它靜默
滾成 3 月 3 日，於是**不存在的生日通過了驗證**。domain 版本以原樣往返判斷日曆
有效性，並新增 `not_a_calendar_date` 原因代碼。另外釘住一條性質重要的規則：
**錯誤訊息不得回填輸入值**——錯誤會進日誌，把身分證字號放進去等於讓 PII 從一條
沒有人在看的路徑外流。

身分證字號仍**只驗格式不驗檢查碼**（預覽站用的是編造號碼），解除條件寫在原始碼
註解，與 D-001／D-003 綁定。

### 3.3 新增 `check:architecture`

補的是既有把關測不到的那一塊：`check:sync` 只保證 vendored 副本位元一致，不保證
瀏覽器沒有另外自己寫一份；型別檢查擋不住方向寫反的依賴；單元測試會通過，即使一個
檔案從來沒有被任何路由載入過。

三條規則，四種違反情形都以注入錯誤實測過會紅，且確認註解裡引用被禁寫法不會誤報：

1. **依賴方向**：domain 只能相對匯入（測試可用 vitest）；contracts 只依賴 zod；
   `apps/web/public` 不得有裸名匯入（瀏覽器沒有解析裸名的打包器）。
2. **未接線清單**：`apps/api` 內從 `main.ts` 走不到的檔案，必須列在
   `apps/api/unrouted-inventory.json` 並寫明被哪個決策擋住；**反向也擋**——已接上
   路由卻還留在清單裡會紅，清單因此不會變成謊言。目前 11 筆。
3. **domain 規則單一來源**：瀏覽器不得寫死 `timeZone: 'Asia/Taipei'`、不得重寫
   身分證格式規則；且 domain 每新增一個原因代碼，`patient-registry.js` 就必須有
   對應的中文訊息（漏補不會壞掉，只會安靜地顯示通用訊息，那是最難發現的退步）。

規則 3 當場抓到一筆真的：`admin-bootstrap.js` 自己拼
`toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })`，繞過共用格式化器，同一個
時間在櫃台兩處會長得不一樣。已改走 `formatFullDate`／`formatTime`。

### 3.4 分支保護變成可查證

`evidence` job 會在任一上游失敗時 exit 1，但**只有 GitHub 端把它設為 required**，
紅燈才擋得住合併。那個設定在網頁介面裡、版控看不到，是這個專案唯一靠記憶的把關。

新增 `scripts/check-branch-protection.mjs`（`pnpm check:branch-protection`），
同時查 classic branch protection 與 ruleset 兩種設定。**沒有 token 時回離開碼 2
而不是 0**——「查不到」不能長得像「通過」。它不進 `verify`：需要網路與具
`administration:read` 的 token，而 verify 必須離線可跑。

要設定的名字是 **`Verification evidence`**，不是 job id `evidence`——`verify.yml`
的該 job 設了 `name:`，而 GitHub 的 status check context 用的是顯示名稱。拿 job id
去設，會設到一個永遠不會出現的檢查，看起來有保護、實際上永遠不會擋。

**本次未能確認實際狀態**（本機沒有 `gh`、沒有 token、Chrome 擴充未連線）。

**負責人當日決定（D-013）：設必要檢查，但保留管理者例外**——「Do not allow
bypassing」不勾，負責人與任何使用其憑證的助理仍可直接推 main（這是明確要求，
為的是其他 AI 工具也能照常運作）。**代價要說清楚：走那條路的推送不受 CI 把關**，
實質防線是推送前跑 `corepack pnpm verify`，那是慣例而非強制；必要檢查保護的是
協作者與往後的 PR。

## 4. 還沒處理的

| 項目 | 卡在哪 |
| --- | --- |
| 署徽**合規比對**（非「要不要留」——那已由 D-012 決定為知情保留） | 正式網域上線前必須比對健保署使用注意事項，屆時重看 D-012 |
| 分支保護**實際設定** | D-013 已決定內容；GitHub 端的開關仍需負責人操作，之後以 `check:branch-protection` 查證 |
| 個資法第 8 條告知、保存期限、清除路徑 | D-001～D-003 |
| 身分證檢查碼、居留證統一證號 | 同上，真實 intake 才適用 |
| CodeQL 是否真的有結果 | 私有 repo 需 Advanced Security（D-010） |
| 未接線的 11 個 API 檔案 | 依 inventory 各自的決策（D-006／D-010） |

## 5. 官方依據

- 健保署《使用全民健康保險標誌注意事項》
  <https://www.nhi.gov.tw/ch/cp-13823-5ef86-2333-1.html>
- 衛福部〈健保 logo 有商標，冒用會有法律責任〉
  <https://www.mohw.gov.tw/cp-3568-38393-1.html>
- 《全民健康保險醫事服務機構特約及管理辦法》
  <https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=L0060008>
- 《個人資料保護法》第 8 條（告知義務）、第 27 條（安全維護措施）
  <https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=I0050021>
