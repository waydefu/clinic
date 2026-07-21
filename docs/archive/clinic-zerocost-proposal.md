# 診所全通路自動化預約系統

> **文件狀態：已被取代，僅保留歷史參考。** 本文件的 Firebase Spark、Vercel
> Hobby、Google Apps Script 與 Calendar 事件放入病患姓名／電話等做法，已不符合
> 現行企業級、安全與個資最小化架構。請以
> [一森渼診所企業級預約平台專案規劃書](../enterprise-appointment-project-plan.md)
> 與[文件索引](../README.md)內的決策登錄、核准包及測試檢查點為唯一現行來源；
> 本文件不得作為部署或上線依據。
>
> 2026-07-21 由專案根目錄移入 `docs/archive/`，內容未修改。

## 零營運成本企劃書
### Firebase Spark 為核心，互補免費服務填補缺口

**版本：** 1.0  
**日期：** 2026年7月  
**適用規模：** 單一診所，日預約量 ≤ 150筆  
**月營運費用：** NT$0（開發成本另計）

---

## 一、前言：先把這件事說清楚

「Firebase 零成本」這個說法本身有個常見的陷阱，必須在企劃開始前點明：

**Firebase Cloud Functions 在 Spark（免費）方案下無法使用。**

多數企劃書把 Cloud Functions 當作後端核心，卻沒說這需要升級到 Blaze（pay-as-you-go）計畫並綁定信用卡。Blaze 方案雖然在免費配額內不會產生帳單，但一旦流量峰值或設計不當，單月費用可能出乎意料。對診所而言，「可能產生費用」與「保證零成本」是本質不同的承諾。

本企劃書的設計原則：不依賴 Cloud Functions，不需要信用卡，不設任何付費觸發器，在單一診所規模下結構性地確保零營運成本。

---

## 二、整體技術架構

### 2.1 服務選型總表

| 功能層 | 選用服務 | 方案 | 月費 | 關鍵免費配額 |
|-------|---------|------|------|------------|
| 前端框架 + 部署 | Next.js + Vercel | Hobby | NT$0 | 頻寬 100GB、無限 API Routes |
| 資料庫 | Firebase Firestore | Spark | NT$0 | 讀取 50K次/日、寫入 20K次/日 |
| 身份驗證 | Firebase Auth | Spark | NT$0 | Email/Google/匿名，無上限 |
| 靜態資源 | Vercel or Firebase Hosting | Spark | NT$0 | Firebase 10GB 儲存 |
| 後端 API | Vercel API Routes（Next.js） | Hobby | NT$0 | 取代 Cloud Functions，真正免費 |
| Google 日曆整合 | Google Apps Script Web App | 免費帳號 | NT$0 | 執行 6h/日、URL Fetch 20K次/日 |
| 電子郵件通知 | Brevo（前 Sendinblue） | Free | NT$0 | 300 封/日，9,000 封/月 |
| 推播通知（PWA） | Firebase Cloud Messaging | 免費 | NT$0 | 無上限 |
| LINE 整合 | LINE Messaging API | Free | NT$0 | 入站 webhook 無限；出站 200則/月 |
| CI/CD | GitHub Actions | Free | NT$0 | 私有 repo 2,000 分鐘/月 |

**月總費用：NT$0**

### 2.2 架構示意圖

```
病患
 ├─ Web 預約頁面（PWA）
 ├─ LINE 對話
 ├─ FB Messenger
 └─ Instagram DM
          │
          ▼
 ┌─────────────────────────────┐
 │    Next.js (Vercel Hobby)    │
 │  ├─ 前端：預約介面 + 管理後台   │
 │  └─ API Routes：業務邏輯層    │  ← 取代 Cloud Functions
 └──────────────┬──────────────┘
                │
        ┌───────┼───────────────┐
        │       │               │
        ▼       ▼               ▼
  Firestore   Firebase Auth  Google Apps Script
  (資料庫)   (身份驗證)      (Google Calendar 橋接)
        │
        ▼
  Firebase FCM（推播）
  Brevo（Email 通知）
  LINE Reply API（免費回覆）
```

---

## 三、Firebase Spark 配額實際分析

以下以「單一診所，每日 50 個預約」為基準計算，驗證 Spark 配額是否足夠。

### Firestore 每日讀寫估算

| 操作 | 次數/日 | 讀取/日 | 寫入/日 |
|-----|--------|--------|--------|
| 病患查詢可用時段 | 100 次查詢 × 8 讀取 | 800 | 0 |
| 病患建立預約 | 50 筆 × 3 讀取（防撞）+ 1 寫入 | 150 | 50 |
| 預約確認/狀態更新 | 50 筆 × 1 寫入 | 0 | 50 |
| 診所管理後台讀取 | 20 次查看 × 30 讀取 | 600 | 0 |
| LINE Webhook 觸發讀寫 | 30 次 × 5 讀取 + 1 寫入 | 150 | 30 |
| **合計** | — | **1,700** | **130** |
| **Spark 上限** | — | **50,000** | **20,000** |
| **使用率** | — | **3.4%** | **0.65%** |

**結論：Spark 配額對單一診所而言寬裕到幾乎感覺不到上限。**  
即使成長到每日 500 個預約（超大型診所），讀取也僅 17,000次，仍在免費範圍內。

### Vercel API Routes 配額

Vercel Hobby 方案的 Serverless Functions：
- 函式執行次數：100K 次/月（每日 3,300 次）
- 執行時間上限：10 秒/次
- 記憶體：1,024 MB

每日 50 個預約 × 各涉及 5 次 API 呼叫 = 250 次/日，遠低於 3,300 次上限。

### Google Apps Script 配額

| 配額項目 | 上限 | 診所預估用量 |
|---------|------|------------|
| 每日執行時間 | 6 小時 | < 1 分鐘 |
| 每次執行時間上限 | 6 分鐘 | < 2 秒 |
| 日曆建立/修改事件 | 5,000 次/日 | 50–100 次/日 |
| Email 傳送（Gmail） | 100 封/日 | 依需求 |
| URL Fetch（外部呼叫） | 20,000 次/日 | < 100 次/日 |

GAS 是 Google Calendar 整合的最佳免費橋接層，配額遠超診所需求。

---

## 四、模組設計

### 4.1 後端：Vercel API Routes（取代 Cloud Functions）

Next.js API Routes 部署在 Vercel 上，行為與 Cloud Functions 完全相同，但不需要 Blaze 方案。

核心 API 端點設計：

```
POST /api/appointments/check-slot
  ─ 查詢指定日期時段是否可用
  ─ 回傳：{ available: boolean, nextAvailable: string | null }

POST /api/appointments/create
  ─ 原子性建立預約（含防撞驗證）
  ─ 觸發：日曆同步 + Email 通知 + LINE 回覆

GET  /api/appointments/slots?date=YYYYMMDD
  ─ 回傳當日所有時段狀態

PATCH /api/appointments/:id/cancel
  ─ 取消預約，釋放時段

POST /api/webhook/line
  ─ 接收 LINE 平台 webhook 事件
  ─ 解析意圖 → 回覆或引導至 Web 預約頁

POST /api/webhook/messenger
  ─ 接收 FB Messenger webhook
  ─ 同上處理邏輯

GET  /api/admin/appointments?date=YYYYMMDD
  ─ 診所後台，需 Firebase Admin SDK 驗證
```

API Routes 直接使用 Firebase Admin SDK（在 Vercel 伺服器端執行，安全性等同 Cloud Functions）。

### 4.2 雙重預約防範機制

核心設計：**以「日期\_時段」為 Firestore 文件 ID，原子性寫入**。

Firestore 資料結構：
```
appointments/
  20260720_0900/    ← 文件 ID = 日期 + 時間，天然唯一鍵
    patientId: "..."
    patientName: "王小明"
    phone: "0912-345-678"
    email: "wang@example.com"
    date: "2026-07-20"
    timeSlot: "09:00"
    status: "confirmed"
    source: "web" | "line" | "messenger" | "ig"
    calendarEventId: "..."    ← Google Calendar 事件 ID
    createdAt: Timestamp
```

防撞邏輯（Vercel API Route 伺服器端）：

```typescript
// /api/appointments/create
const docRef = db.doc(`appointments/${date}_${timeSlot}`);

await db.runTransaction(async (tx) => {
  const existing = await tx.get(docRef);
  if (existing.exists) {
    throw new Error('SLOT_TAKEN');   // 拋出錯誤，整個 transaction 回滾
  }
  tx.set(docRef, appointmentData);  // 原子性寫入
});
```

Firestore Transaction 保證原子性：即使兩個請求同時到達，只有一個會成功寫入，另一個會收到 SLOT_TAKEN 錯誤。這不需要 Cloud Functions，在 Vercel API Routes 中完全可行。

### 4.3 Google Calendar 整合（Google Apps Script 橋接）

**為何用 GAS 而非直接呼叫 Calendar API？**  
直接呼叫 Google Calendar API 需要在前端暴露 OAuth Token 或在後端管理 Service Account JSON，安全性較複雜。GAS 本身就是 Google 帳號的延伸，天然有日曆寫入權限，部署為 Web App 後提供一個 HTTPS endpoint，Vercel API Route 呼叫即可。

GAS 腳本設計：

```javascript
// Google Apps Script
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const { action, event } = payload;

  const calendar = CalendarApp.getCalendarById('clinic@gmail.com');

  if (action === 'CREATE') {
    const newEvent = calendar.createEvent(
      `${event.patientName} 預約`,
      new Date(event.start),
      new Date(event.end),
      { description: `電話：${event.phone}` }
    );
    return ContentService
      .createTextOutput(JSON.stringify({ eventId: newEvent.getId() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'DELETE') {
    const calEvent = calendar.getEventById(event.calendarEventId);
    if (calEvent) calEvent.deleteEvent();
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

GAS Web App 部署為「以診所帳號身分執行，任何人可存取」，並在 Vercel 環境變數中儲存 GAS URL + 共用 Secret Token 進行驗證。

### 4.4 通知系統：免費組合拳

**Email：Brevo（300封/日）**

50 個預約/日 × 2 封（確認 + 提醒）= 100 封，配額充裕。

```typescript
// Vercel API Route 呼叫 Brevo API
await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': process.env.BREVO_API_KEY },
  body: JSON.stringify({
    to: [{ email: patient.email }],
    subject: '預約確認 - 陳醫師診所',
    htmlContent: confirmationEmailTemplate(appointment),
  }),
});
```

**PWA 推播：Firebase Cloud Messaging（完全免費）**

FCM 對 PWA（Progressive Web App）的 Web Push 完全免費且無上限。病患在瀏覽器許可推播通知後，即可在預約前 24 小時收到提醒，不依賴 Email 或 LINE。

實作前提：Next.js 加入 Service Worker + Web Push 訂閱，FCM Token 存入 Firestore。

**LINE 通知：Reply API 策略（零成本）**

LINE Free Plan 允許出站 200 則/月的 Push Message，但 **Reply Message 完全免費且無上限**。

Reply Message 的觸發條件：病患主動傳訊 → LINE 回傳 reply token（有效期 30 秒）→ 用 reply token 回覆，不計入 200 則配額。

設計策略：
- 病患在 LINE 傳送任何訊息（例如「預約」）→ Webhook 觸發 → 回傳預約選單（Reply，免費）
- 病患選擇時段確認 → 回傳確認訊息（Reply，免費）
- 主動提醒（Push）→ 改用 FCM 推播 + Email，不使用 LINE Push

此策略可讓 LINE 流程幾乎完整運作，僅失去「主動推送提醒到 LINE」的能力，以 FCM/Email 補足。

---

## 五、Firestore Security Rules（資安第一道防線）

不依賴 Cloud Functions 時，Firestore Security Rules 是防止惡意寫入的關鍵。

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 預約文件：只允許透過 API（Admin SDK）寫入
    // 前端不直接寫入 Firestore，透過 Vercel API Route 處理
    match /appointments/{appointmentId} {
      allow read: if request.auth != null
                  && resource.data.patientId == request.auth.uid;
      allow write: if false;  // 全部交給後端 Admin SDK
    }

    // 時段查詢：任何人可讀（無需登入即可查看可用時段）
    match /slots/{slotId} {
      allow read: if true;
      allow write: if false;
    }

    // 病患個人資料：本人才可讀寫
    match /patients/{patientId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == patientId;
    }

    // 診所設定：只有管理員可讀寫
    match /clinic/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.token.admin == true;
    }
  }
}
```

後端（Vercel API Route）使用 Firebase Admin SDK，其操作完全繞過 Security Rules，享有最高寫入權限，且 Admin SDK 金鑰只存在 Vercel 伺服器端環境變數，不暴露給前端。

---

## 六、資料模型設計

```
Firestore
├── appointments/             ← 預約主資料
│   └── {YYYYMMDD_HHMM}/     ← 文件 ID = 唯一時段鍵，天然防撞
│       ├── patientId
│       ├── patientName
│       ├── phone
│       ├── email
│       ├── lineUserId (nullable)
│       ├── date
│       ├── timeSlot
│       ├── duration (minutes)
│       ├── status: "pending" | "confirmed" | "cancelled" | "completed"
│       ├── source: "web" | "line" | "messenger" | "ig"
│       ├── calendarEventId
│       └── createdAt
│
├── patients/                 ← 病患資料（登入後建立）
│   └── {uid}/
│       ├── displayName
│       ├── phone
│       ├── email
│       ├── lineUserId
│       └── fcmTokens: []     ← 多裝置推播支援
│
├── clinic/
│   ├── settings/
│   │   ├── workingHours: { mon: {start: "09:00", end: "18:00"}, ... }
│   │   ├── slotDuration: 20  ← 分鐘/診次
│   │   └── breakTimes: [{ start: "12:00", end: "14:00" }]
│   └── blockedDates/
│       └── {YYYYMMDD}/       ← 休診日或特殊時段
│           └── reason: "院長假"
```

---

## 七、時程規劃（現實版）

### Phase 0：MVP 核心上線（6–8 週）

**目標：** 讓病患可以透過網頁預約，預約自動進 Google Calendar，診所管理者可在後台查看與管理。

| 週次 | 工作項目 | 交付物 |
|-----|---------|-------|
| 第 1 週 | Firebase 專案設定、Vercel 部署、GAS 腳本開發 | 可運作的環境骨架 |
| 第 2 週 | Firestore Schema 設計、Security Rules、Admin SDK 整合 | 資料層完成 |
| 第 3–4 週 | 預約 API Routes（防撞邏輯 + Calendar 同步）、Email 通知 | 後端核心完成 |
| 第 5–6 週 | 前端預約流程（Next.js）、Firebase Auth、PWA 設定 | 可對外開放的預約系統 |
| 第 7 週 | 診所管理後台（時段管理、預約列表、取消）| 管理功能完成 |
| 第 8 週 | 壓力測試、防撞情境測試、UAT（診所實際操作驗證）| 上線 |

### Phase 1：社群通路整合（4–6 週，Phase 0 後）

| 週次 | 工作項目 | 交付物 |
|-----|---------|-------|
| 第 1–2 週 | LINE Webhook 處理、Reply API 整合、LIFF 頁面嵌入 | LINE 預約流程上線 |
| 第 3–4 週 | FB Messenger Webhook、Instagram 基礎回覆 | 社群整合完成 |
| 第 5–6 週 | FCM Web Push 通知、預約提醒排程（Vercel Cron）| 自動提醒上線 |

**Vercel Cron Jobs 說明：** Vercel Hobby 提供每日 1 次 Cron 執行，可在每天早上執行「隔日預約提醒」發送任務，免費且無需額外服務。

### Phase 2：升級評估（視業務成長而定）

當診所達到以下任一條件時，再評估付費升級：
- 日預約量穩定超過 300 筆（Firestore 讀取逼近 50%）
- LINE 主動通知需求超過 200 則/月（需升級 LINE Light Plan NT$888/月）
- 需要即時 Webhook 處理超過 3,300 次/日（需 Vercel Pro）

---

## 八、真正的限制（誠實清單）

本方案確實為零成本，但有幾個結構性限制，必須事先說明：

**LINE 主動推播限制（最重要）**  
200 則/月的 Push Message 對有預約量的診所不足。本方案以 FCM 推播 + Email 補位，但若病患偏好在 LINE 收到提醒，這是無法迴避的限制。若每月 LINE 通知需求超過 200 則，需升級到 LINE Light Plan（NT$888/月）。

**Vercel Hobby 不支援商業用途（Terms of Service）**  
Vercel Hobby 計畫的服務條款明定「個人非商業用途」。診所屬商業用途，嚴格來說需要 Vercel Pro（$20/月，含 1TB 頻寬）。如需完全合規，可用 Firebase Hosting 部署靜態前端，Vercel 僅用於 API Routes，或直接升級 Vercel Pro。另一個選項：使用 Cloudflare Pages + Workers（Free Plan，無商業限制，100K requests/day）。

**Firebase Auth 電話簡訊驗證**  
Spark 方案每日僅提供 10 次 SMS OTP，不足以為病患驗證手機號碼。替代方案：Email 驗證連結（免費、無上限）+ 手機號碼僅作為填寫欄位而非驗證依據。

**GAS 執行時間不穩定**  
GAS 在 Google 冷啟動時偶有 2–5 秒延遲，Calendar 同步不是即時的，但在預約確認流程中可接受（非同步寫入，不影響病患等待體驗）。

**無 SLA 保障**  
免費服務均無 SLA 承諾，Vercel Hobby 和 Firestore Spark 沒有 99.9% uptime 的正式保證。實測穩定性良好，但醫療系統若對可用性有嚴格要求，這一點需納入考量。

---

## 九、升級路徑（付費觸發條件）

本方案設計為線性升級，業務驗證後按需付費：

| 成長節點 | 觸發條件 | 建議升級 | 月費增加 |
|---------|---------|---------|---------|
| 社群通知量成長 | LINE 需求 > 200 則/月 | LINE Light Plan | NT$888 |
| 商業用途合規化 | 診所正式對外服務 | Vercel Pro | NT$630（$20） |
| Firestore 讀取成長 | > 50% 配額使用 | Firebase Blaze | NT$0（仍在免費額度）→ 依超量計費 |
| 多診所擴充 | 第二間診所上線 | Vercel Pro 已涵蓋 | 無額外費用 |
| 簡訊通知需求 | 需 SMS 驗證或提醒 | Twilio Pay-as-go | 依量（約NT$1.5/則） |

升級順序建議：LINE Light Plan（NT$888）→ Vercel Pro（NT$630）→ 其餘依需求。  
前兩項合計 NT$1,518/月，仍遠低於原企劃書方案的 NT$4,000+ 月費。

---

## 十、成本結構圖（全生命週期）

```
Month 1–N（零成本期）
├── 開發成本：NT$ 25–60萬（一次性，估算見備註）
├── 月營運費：NT$ 0
└── 條件：日預約量 < 150筆，LINE需求 < 200則/月

Month X+（選擇性升級）
├── LINE Light Plan：NT$ 888/月（若需主動推播）
├── Vercel Pro：NT$ 630/月（若需商業 SLA）
└── 月上限：NT$ 1,518（約$50）vs 原方案 NT$ 4,000+
```

---

## 十一、結論

本方案將兩份原始企劃書的月營運成本從估算的 NT$3,000–6,000 下降至 NT$0，同時維持：

- 雙重預約防範（Firestore Transaction，伺服器端原子性）
- Google Calendar 自動同步（GAS 橋接）
- 多通路預約（Web / LINE / Messenger / IG）
- 病患推播通知（FCM + Email）
- 管理後台（Next.js + Firestore）
- 前後端分離架構（Vercel API Routes 取代 Cloud Functions）
- 可線性升級的技術債務水位

架構沒有過度工程化，也沒有為了省錢而犧牲核心功能的安全性與正確性。真正的成本在開發階段，不在營運階段——這對一個想先驗證市場可行性的診所而言，是最合理的投資結構。

---

**備註：開發成本參考估算**

| 情境 | 說明 | 估算 |
|-----|------|------|
| 自行開發（有 Next.js + Firebase 基礎） | 1 人，兼職 12 週 | NT$ 0–5萬（時間成本） |
| 外包 MVP（Phase 0） | 1–2 人團隊，8 週 | NT$ 25–50萬 |
| 外包含社群整合（Phase 0+1） | 同上，延伸至 14 週 | NT$ 40–80萬 |

開發成本估算不含後續維護，合約應要求交付原始碼所有權與技術文件。

---

*本企劃書為技術方向規劃，實際執行前應進行 LINE Messaging API 審核確認、Vercel Terms of Service 確認（商業用途）、及 Google Calendar Service Account 設置驗證。*
