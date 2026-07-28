# ADR-0005：Patient intake／verification 與 appointment command 分離

**狀態：** 已接受 Stage 0 邊界；身分驗證方案仍待決策
**日期：** 2026-07-24

## 背景

公開預約畫面目前在 synthetic-only 瀏覽器狀態中收集姓名、電話、生日（月日
必填、年份選填）、身分證／居留證或護照、健保卡攜帶意向、患者備註，以及本次
門診與來源標籤；正式 domain `BookingRequest` 則只接受 opaque `patientId`。若把
兩者直接合併成一個 API request，controller、通路 adapter 與 domain 會各自猜測
如何建立或比對病患，也會讓未核准的個資欄位繞過 D-001～D-003、D-006 與
D-011。

Stage 0 可以固定技術邊界，但不能替診所決定合法依據、必填欄位、本人驗證方法、
重複病患處理、保存期限、角色權限或公開通路。

## 決定

正式資料流分成兩個邊界：

```text
decision-gated intake / identity verification
  -> server-verified opaque patient identity
  -> appointment application service
  -> appointment domain command
```

1. Patient intake／verification 擁有病患欄位的收集、正規化、查找、建立、比對、
   合併候選與驗證流程。它必須先取得 D-001～D-003、D-006、D-011 的核准，才可
   定義 executable contract 或啟用 route。
2. Appointment command 只描述預約意圖：idempotency key、slot、service 與
   booking kind。它不接受姓名、電話、email、生日、身分證、健保卡資料、
   `patientId`、actor、role、policy version 或 client timestamp。
3. `patientId`、actor 與 role 只能來自 server-produced authentication context；
   appointment ID、UTC timestamp 與 correlation ID 只能由 server 產生。
4. Raw identity 不得成為 document ID、URL、log、correlation ID、idempotency
   key、Calendar event ID 或社群／NAS connector 的 routing key。
5. Web、未來 App、LINE、Meta 與 NAS adapter 都只能呼叫 API；不能自行建立
   `patientId`，也不能直接讀寫 Firestore。
6. D-001～D-003、D-006、D-011 核准前，正式 intake schema、驗證因子、matching
   algorithm、merge policy、retention 與錯誤措辭全部維持 TBD；現有 preview
   仍只可使用 synthetic browser-local data。

## 不在本決定內

- 是否保存 national ID 或使用 HMAC blind index；
- 初診、回診與代理人預約的驗證因子；
- LINE／Meta account 是否可作聯絡或登入依據；
- NAS 既有病歷如何匯入、比對或成為 source of truth；
- privacy policy、acceptance、retention、DSR 與病患合併流程。

以上項目均須由對應 decision owner 核准，不能由 adapter 或 UI 預設。

## 後果

- `CreateAppointmentRequestSchema` 可以保持最小且 strict；body 夾帶 patient、
  actor 或 role 會被拒絕。
- Application service 只接受已驗證的 opaque patient context；缺少
  `verifiedPatientId` 必須失敗，不可 fallback 至 body。
- Intake 與 appointment 可獨立版本化、授權、稽核與限流。
- 未來接診所伺服器、NAS、LINE 或 Meta 時，需新增受控 adapter 與 outbox／API
  邊界，不必改寫 appointment domain invariant。

## 替代方案

- **單一 public booking payload 同時收個資與預約：** 拒絕。它會把 privacy、
  identity 與 slot reservation 綁成一個難以授權及版本化的 contract。
- **由 client 傳 `patientId`：** 拒絕。client 不能證明該識別碼屬於目前使用者，
  會形成 BOLA／IDOR 邊界缺口。
- **現在先選定驗證方法：** 拒絕。缺少診所、法務、資安與營運的 D-001～D-003、
  D-006、D-011 決策。
