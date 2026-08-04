# 產品定位與長期方向

**狀態：** plan-only 產品定位。不改變目前 Stage、不啟用任何路由、不關閉任何 D-series 決策。

**撰寫日期：** 2026-08-04

---

## 1. 產品定位

**Boutique Clinical Command｜鼻功能與睡眠呼吸專科診所的全通路營運工作臺**

視覺方向「Boutique Clinical Command」已於 2026-07-25 定案並完成六階段實作，見
[設計方向文件](../design/boutique-clinical-command-2026-07-25.md)。本文件把它從
**視覺方向**擴展為**產品定位**，兩者不衝突：前者定義長什麼樣，後者定義它是什麼。

### 1.1 為什麼不是「醫美診所系統」

負責人 2026-08-04 提出的定位草稿為「醫美診所全通路營運與預約工作臺」。經盤點，
**現行產品的服務線與內容邊界都不支持這個描述**：

- 線上診所網站的四條服務線是鼻功能醫學、止鼾五合一、下鼻甲手術、鼻中隔手術，
  外加止鼾好眠牙套；醫師團隊為耳鼻喉專科與麻醉科。
- [`tests/e2e/clinic-site.spec.ts`](../../tests/e2e/clinic-site.spec.ts) 有一條**主動
  斷言**，要求診所網站導覽不得出現「微整形｜整形手術｜光電注射」。
- [根 README](../../README.md) 記載：「Plastic-surgery and injectable/medical-aesthetic
  category pages are excluded.」

也就是說，排除醫美類別是**刻意設下的內容邊界**，很可能涉及醫療廣告法規。把產品
定位改寫成醫美，會與這條邊界正面牴觸，而且會使一條現行測試變成必須拆除的障礙。

**2026-08-04 決定：維持鼻功能與睡眠呼吸為主要服務線，醫美（如自體肋隆鼻）為次要。**
若日後要轉向醫美，須先取得新決策解除內容邊界，不得由實作端悄悄放寬。

### 1.2 核心價值

> 讓櫃檯在一個畫面完成一天的營運，而不是在五個頁面之間往返。

這句話是所有設計取捨的裁決標準。當「資訊密度」與「視覺留白」衝突時選前者；當
「一次點擊完成」與「流程正確性」衝突時選後者。

---

## 2. 使用角色

內部工作臺與患者端**必須分離**，不共用 Shell、不共用導覽、不共用建置入口。

### 2.1 內部

| 角色 | 主要工作 | 現況 |
| --- | --- | --- |
| 管理者 | 全域設定、員工權限、金額、稽核 | 已實作（瀏覽器端稱 `admin`） |
| 櫃檯 | 每日預約、改期、取消、到診、個管指派 | 已實作 |
| 諮詢師 | 自己負責的病患與個案 | **未實作** |
| 醫師 | 自己相關的預約與必要醫療資訊 | **未實作**（D-006 已核准基線） |
| 未來：護理師、麻醉人員、財務 | — | 依 D-014／D-015 阻擋 |

角色收斂的完整矩陣與六個實施位置見 [角色權限矩陣](../architecture/rbac-matrix.md)。

### 2.2 患者端

病患只看得到自己的資料與預約。患者端**不得出現**任何內部工作臺入口、測試工具、
金額管理或系統設定。

---

## 3. 產品核心能力

目前產品在外界看來是一個預約網站。長期方向是一套診所營運系統，預約只是其中一環：

| 能力 | 目前狀態 | 阻擋 |
| --- | --- | --- |
| 診所日程管理 | 週曆為輔助檢視，非主工作區 | 無（可做，P2） |
| 病患資料管理 | 合成、瀏覽器本機 | D-001～D-003 |
| 初診／回診管理 | 完整生命週期已實作 | 無 |
| 醫美與手術管理 | **未實作**，plan-only | D-014 |
| 個管與諮詢師管理 | 個管指派已實作；諮詢師角色未實作 | D-007 |
| 費用與付款紀錄 | **未實作** | D-015 |
| Google Calendar 雙向同步 | 單向投影已寫好但未連線；雙向未實作 | D-009、D-016 |
| 通知與待辦 | 通知鈴鐺已實作（合成） | 無 |
| 稽核與權限 | audit v2 已實作；RBAC 未接線 | D-006 實作證據 |
| 營運分析 | **未實作** | D-008 |
| 多分院與多資源排程 | **未實作**，無資料模型 | 需新決策 |
| Web／LIFF／App 共用後端 | 後端未部署 | D-011＋新決策 |

**這張表最重要的一欄是「阻擋」。** 十二項能力中有九項卡在尚未核准的決策，不是卡在
工程排期。在對應決策核准前，這些項目只能規劃，不能實作。

---

## 4. 現況邊界（必讀）

本文件描述的是**方向**，不是現況。截至 2026-08-04 的實際狀態：

- 雲端資料庫**未啟用**；[`firestore.rules`](../../firestore.rules) 全域拒絕讀寫。
- 身分驗證**未啟用**；工作臺目前是角色模擬，非認證。
- Cloud Functions **未部署**；`apps/api` 只掛 `/v1/health`，其餘能力刻意未接線。
- Google 日曆**未連線**；用戶端程式已寫好，憑證由負責人保管。
- 基礎設施為 plan-only；`infra/terraform/` 只有一份 README。
- 真實病患資料**未處理，且不得處理**。

依 [文件生命週期規則](../document-lifecycle.md) §4，本文件的任何敘述都不得被引用為
「該能力已存在」。現況以 [roadmap](../roadmap.md) §一 為準。

---

## 5. 長期方向

三個不隨階段改變的架構承諾，它們讓未來加 LIFF、App、NAS 時不必重新設計安全模型：

1. **domain API 是唯一寫入路徑**（[ADR-0001](../adr/0001-domain-api-is-the-only-write-path.md)）。
   任何新通路都接 API，不直接碰資料庫。
2. **Firestore 直接存取預設拒絕**（[ADR-0003](../adr/0003-firestore-direct-client-access-is-deny-by-default.md)）。
3. **外部效果一律走 outbox**。Firestore 交易內不呼叫 Calendar、Email、LINE、Meta 或 NAS。

第三點的推論：Google Calendar 目前是**投影，不是可用性的真實來源**
（[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)）。要改成雙向同步
是架構方向的反轉，必須以新 ADR 取代 ADR-0002，並先關閉 D-016——詳見
[日曆雙向同步規劃](../architecture/calendar-bidirectional-sync-plan.md)。

未來資料庫遷移至 NAS＋MySQL 的抽象層屬 P7，目前只記錄方向：因為寫入已收斂在
domain API 後方，儲存層替換的影響面被限制在 repository port，不擴散到 UI。

---

## 6. 相關文件

- [產品能力 Roadmap](../roadmap.md#產品能力-roadmapp0p7) — P0～P7 與治理 Stage 對照
- [角色權限矩陣](../architecture/rbac-matrix.md)
- [App Shell 與日程工作區重構規劃](../design/ui-shell-and-scheduling-redesign-plan.md)
- [行動版 UX 規劃](../design/mobile-ux-plan.md)
- [日曆雙向同步規劃](../architecture/calendar-bidirectional-sync-plan.md)
- [測試策略](../architecture/test-strategy.md)
- [Boutique Clinical Command 視覺方向](../design/boutique-clinical-command-2026-07-25.md) — 已完成的六階段
- [企業級專案規劃書](../enterprise-appointment-project-plan.md) — 完整架構與資料模型
