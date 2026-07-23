# Stage 0 Checkpoint A 架構複查

- 複查日期：2026-07-24（Asia/Taipei）
- 實作範圍：`c5e0ac9`、`823d47c`、`429cbd0` 與本複查所補的 contract/ADR 證據
- 前次基準：[2026-07-23 企業級上線前審查](2026-07-23-enterprise-production-readiness-review.md)
- 線上證據：<https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app/>
- 預覽 release：2026-07-24 00:43；到期：2026-07-31 00:43（Asia/Taipei）

## 結論

**Checkpoint A 通過。** Stage 0 所要求的 contract boundary、未掛路由的
application boundary、patient active-booking guard、audit v2、idempotency
binding，以及 worker trace/metrics seam 均已有本機可執行證據。

這是架構硬化 checkpoint，**不是 production 評分或上線核准**。D-001～D-011
仍全部為 `pending`；booking route、真 IdP/RBAC、cloud Firestore、正式資料、
Calendar projection、LINE／Meta／NAS adapter、Terraform apply 與 live-channel
deployment 全部維持關閉。

## Stage 0 工作核對

| # | 工作 | 結果 | 證據 |
| ---: | --- | --- | --- |
| 1 | 完整 command/response/error inventory | 通過 | `api-v1-contract.md` 盤點 health、identity、appointment、follow-up、schedule、case、payroll 與 10 個 v1 error codes；未核准項目明示為 inventory only |
| 2 | 移除未核准 optional email | 通過 | `CreateAppointmentRequestSchema` 不含 email；strict contract test 明確拒絕 email |
| 3 | 分離 patient intake/verification 與 appointment command | 通過 | ADR-0005 固定邊界；實際欄位、verification、matching、merge 與 retention 保持 TBD |
| 4 | Application service / auth context / policy / repository port | 通過 | `apps/api/src/appointments` 與 `apps/api/src/auth` 的未掛路由 skeleton；`AppModule` 仍只註冊 health |
| 5 | `patient_booking_guards` transaction | 通過 | planner、Firestore repository 與 transition/reschedule release/retain 行為 |
| 6 | 同病患、不同 slots 競態 | 通過 | Emulator 同時競爭 8 個 slots，恰好一筆成功 |
| 7 | Audit v2 與 transaction assertions | 通過 | strict `AuditEventV2Schema`、同交易 `create`、before/after allowlist、append-only conflict rollback |
| 8 | Outbox jitter design、trace contract、metrics port | 通過 | correlation/causation、pre-I/O trace guard、low-cardinality `WorkerMetricsPort`；full-jitter 公式固定但 runtime 接線仍待 D-010 |

## Checkpoint A 驗收

| 驗收條件 | 結果 | 判定 |
| --- | --- | --- |
| Contracts 與 domain request mapping 明確 | Create 已有 executable application mapping；其他 commands 已盤點 owner、domain target 與 decision gate，未以 browser 行為冒充 contract | 通過 |
| Controller 不直接依賴 Firestore | 目前唯一 controller 是 health；appointment application service 依賴 repository port，booking route 未註冊 | 通過 |
| Body 內 actor/role 被拒絕或忽略 | Strict create schema 直接拒絕 actor、role、patient ID、client time 與 patient profile | 通過 |
| 同 slot 與同 patient 跨 slot 競態只有一筆成功 | Emulator 覆蓋兩種競態；失敗請求沒有部分 appointment/guard/slot/audit/outbox/idempotency 寫入 | 通過 |
| `verify` / Rules 全綠 | 2026-07-24：`corepack pnpm verify` 19 files、157 tests 全通過；`corepack pnpm test:rules` 5 files、58 tests 全通過 | 通過 |

## 對前次主要發現的影響

| 前次發現 | Checkpoint A 狀態 |
| --- | --- |
| Contract/domain 欄位不一致 | Stage 0 缺口已關閉：appointment command 最小化，identity boundary 分離，完整 inventory 已建立 |
| 缺 application/security boundary | Stage 0 skeleton 已關閉；真 IdP、RBAC、resource scope、rate limit 與 HTTP mapper 仍是後續 gate |
| 同病患跨 slot 競態 | 已關閉 |
| Audit envelope 不足 | Domain/transaction Stage 0 缺口已關閉；production retention、read permission、export 與 immutable storage policy 仍待決策 |
| Idempotency 僅綁 raw key | 已關閉：actor + operation scope + request hash + response reference；raw key 不持久化 |
| Worker 缺 trace、metrics 與 jitter | Trace contract、metrics port、full-jitter design 已關閉；runtime random source、backend、alerts、runner 與 service identity 仍待 D-010 |
| Authentication、privacy、cloud infra、backup/restore | 未關閉，且不屬 Stage 0 可自行核准範圍 |

## 線上 preview 驗證

2026-07-24 重新部署相同 `synthetic-review` channel；網址維持不變，release 到期日
延長七天。驗證結果：

- HTTP 200；
- 頁面包含 `ONLINE PREVIEW` 與 `noindex` 標示；
- `Cache-Control: no-store`、CSP、Permissions-Policy、
  `Referrer-Policy: no-referrer`、`X-Content-Type-Options: nosniff`、
  `X-Frame-Options: DENY`、`X-Robots-Tag: noindex` 生效；
- 部署內容為 `apps/web/public` 的 38 個靜態檔；
- 本次 release 僅更新 `synthetic-review`；未更新 live channel，未部署
  Firestore Rules、Functions、Storage、Authentication 或其他 backend。

## 後續 gate

Checkpoint A 通過後，下一個工程階段不是直接啟用 backend，而是等待具名 owner
完成 Stage 1 決策：

1. D-006 + D-010 核准後，才可提出 Stage 2 cloud foundation/staff identity；
2. D-009 且 Stage 2 完成後，才可接專用測試 Calendar projection；
3. D-001～D-006、D-010、D-011 核准後，才可建立公開 booking 與處理真實病患資料；
4. D-007/D-008 核准後，才可建立 case/payroll persistence；
5. LINE、Meta、email 與 NAS 都只能走 API/outbox adapter，仍需各自的資料、權限、
   retention、failure/recovery 與 vendor review。

在任何 gate 核准前，仍可做的只有 local/Emulator/synthetic 維護、文件審查與不
啟用能力的設計工作。
