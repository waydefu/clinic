# VERIFIED STAGING Execution Plan v1.3 — FROZEN

> v1.3 hardening：保留 v1.2 的 exact-SHA CI / image / Hosting provenance；不重新 Master Planning。
> 本版只封施工契約剩餘缺口：Lane ownership、active-limit contention、smoke boundary、CI retry budget、
> reservationId read-path audit、transition occurrence transaction、PowerShell runtime、PILOT ownership、
> incognito assertions、outbox generation fencing、RC admission set。
> v1.2 / v1.1 保留為歷史對照。

> 用途：直接交給 Hermes 新聊天室作為施工執行上下文。  
> 施工模型：**Muse Spark 1.3 + Grok 4.6**。  
> 目標：從目前已驗證的 `origin/main` 最短合法路徑到達 **VERIFIED STAGING**。  
> 本文件是 execution context；若與 current repository authority 衝突，**repository authority wins**。
>
> **v1.3 不是重新規劃。** v1.2 的 dependency graph、兩 Lane、Owner gates 與 provenance chain 均保留；僅在本版 hardening 明確覆寫時才改變單一 task contract。

---

## 0. 執行原則

### 目標

從目前已驗證的：

```text
origin/main
9e1be1a34a67161fdb9d820211138a2647d3d8cd
```

以**最短合法路徑**到：

> **VERIFIED STAGING**

不以 production 為本週目標。

---

## 1. Executive Summary

### 已知基準

- PR #56 已合併。
- CAL-PILOT session cookie 已改為 `__session`。
- exact-main CI 已存在，但 `Verification evidence` 因 npm advisories endpoint timeout 未達 success。
- 目前沒有證據顯示該 CI failure 是程式 defect。
- staging 尚未部署 #52/#53/#55/#56 最新組合。
- Auth P0 因此仍未 live-verified。
- Governance / PVR 已成熟，本輪不重啟。

### 本輪真正 critical path

```text
exact-main CI (T0-CI-01, baseline health evidence)
       ↓
runtime-only safe deploy path (T0-DEP-01)
       ↓
exact Auth deployment SHA fixed
       ↓
exact-SHA CI green (T0-CI-02)
       ↓
staging Auth deploy
       ↓
Auth smoke
       ↓
remaining correctness work
       ↓
exact RC CI
       ↓
RC staging deploy
       ↓
RC smoke
       ↓
VERIFIED STAGING
```

平行工作則集中處理：

```text
Decision/Register
      ↓
DATA correctness
      ↓
BOOKING correctness
      ↓
server RBAC executable evidence
      ↓
outbox correctness
```

---

## 2. Critical Architecture Findings

### H1 — E2E 跨角色／API 邊界觀測不足

**CONFIRMED**

現行 browser E2E 無法作為 server-side RBAC 的完整證據。

本週不重建龐大 E2E harness，而採：

```text
Nest app.inject negative RBAC tests
+
Firestore Emulator concurrency tests
+
real staging smoke
```

補主要 evidence hole。

API-backed full browser E2E 保留為後續工作。

### H2 — server-side RBAC

#### 正式 booking / workbench

**MISSING / PARTIAL**

UI permission 不算 authoritative enforcement。

因此新增：

> `T1-API-01`

建立**不掛載 production route** 的 server controller + `app.inject` RBAC contract tests。

#### CAL-PILOT

**REFUTED**

CAL-PILOT 已有：

- session guard
- role validation
- CSRF protection
- role-specific restrictions
- fail-closed authentication

仍需補 session integration evidence。

---

## 3. Critical Invariant Matrix

### A. Authorization / RBAC

#### A1 — CAL-PILOT

```text
Status: ENFORCED
Testing: PARTIAL
```

需補：

- suspended account → next request 401
- idle expiry
- absolute expiry
- logout invalidation

→ `T1-API-02`

#### A2 — Booking server RBAC

```text
Status: MISSING as routed production boundary
```

本週：

```text
controller
+
test-only Nest module
+
app.inject
```

但：

> **不得掛入 AppModule**

直到 authority / capability gates 解鎖。

---

### B. Booking / Slot Correctness

#### B1 — 首次 reserve atomicity

```text
ENFORCED
```

已有 transaction + Emulator concurrency evidence。

#### B2 — release 後 slot 可重新預約

```text
BROKEN
```

原因：

```text
releaseSlot
→ reservationId: null

assertSlotBookable
→ !== undefined
```

因此：

```text
null !== undefined
→ slot 被永久視為已占用
```

→ `T1-DATA-01`

#### B3 — audit/outbox occurrence identity

```text
BROKEN
```

原：

```text
audit_${appointmentId}_${nextStatus}
```

合法 cycle 會 collision。

##### 最終修正要求

**不得僅用重新產生的 timestamp hash。**

必須滿足兩個 invariant：

```text
same logical operation retry
→ same occurrence identity

new valid transition occurrence
→ new occurrence identity
```

優先：

```text
appointmentId
+
monotonic transitionVersion / occurrenceId
```

或既有 deterministic idempotency key。

→ `T1-DATA-02`

#### B4 — reschedule atomicity

```text
ENFORCED at domain/repository layer
Patient workflow: MISSING
```

→ `T1-BOOK-04`

#### B5 — active booking limit

目前：

```text
1
```

owner direction：

```text
2
```

但這涉及：

```text
single activeAppointmentId
→ bounded multi-active representation
```

因此 **BOOK-03 必須包含 backward compatibility**。

要求：

```text
legacy single-active guard docs
must remain readable

first mutation may normalize safely

no destructive migration required

restore/emulator fixtures remain compatible
```

→ `T1-BOOK-03`

#### B6 — CAL-PILOT overlap exclusivity

原本不能直接標：

```text
ENFORCED
```

改為：

> **PARTIAL / UNVERIFIED under concurrent phantom creation**

雖然 range query 在 transaction 中是合理設計，但沒有真正的兩 transaction overlap race evidence。

因此：

```text
T1-PILOT-01
```

必須做：

```text
two concurrent createSyntheticAppointment
same bookingKind
overlapping effective interval
```

預期：

```text
exactly one succeeds
exactly one conflicts
```

若結果：

```text
both succeed
```

立即：

> 升格為 critical correctness defect。

不得繼續把目前機制描述成完整 enforced。

---

## 4. Queue / Outbox Invariants

已存在：

- retry
- backoff
- DLQ
- ordering
- requeue worker path

主要缺口：

### Generic outbox fencing

目前 `settle()` 無條件 update。

風險：

```text
worker A lease expires
worker B reclaims
worker A later settles
→ stale worker may overwrite B
```

→ `T1-ARC-01`

新增：

```text
leaseOwner
generation
conditional settle
```

---

## 5. Current-State Reconciliation

### DONE

- Day 1 scope / inventory / acceptance groundwork
- login flash fix
- 404 recovery
- CSP same-origin frame fix
- `__session`
- Governance v2
- Resource-aware verification
- SCM safety work
- PEA / PVR baseline
- CAL-PILOT initial controlled deployment infrastructure

### PARTIAL

- Google Auth
- Auth regression evidence
- server RBAC
- outbox safety
- staff front door
- workbench feedback
- patient reschedule
- mobile/a11y evidence

### OBSOLETE

- rigid Day1 → Day7 sequencing
- previous cancellation recommendation conflicting with newer owner Q5
- old `/` workbench assumption

### NOT REQUIRED FOR VERIFIED STAGING

- Governance v3
- production Calendar sensitive data
- Terraform
- surgery/payment/payroll synthetic modules
- production booking route
- long-term retention decisions
- full API-backed cross-role browser E2E
- production Calendar inbound editing

---

## 6. Execution Tiers

### T0
Critical path / release blockers.

### T1
Core correctness and safety.

### T2
Workflow completeness / evidence / usability.

### T3
Quality coverage.

### T4
Release-candidate staging acceptance.

---

## 7. Model Routing — FINAL

只有兩個施工模型。

### Muse Spark 1.3

#### 預設

```text
reasoning = xhigh
```

簡單文檔 reconciliation 可：

```text
high
```

#### Muse 主責

- DATA
- booking domain
- transactions
- contracts
- server-side authorization boundary
- outbox
- large cross-package change
- complex repository consistency

### Grok 4.6

#### 預設

```text
High
```

高不確定：

```text
xhigh
```

#### Grok 主責

- infra
- deployment tooling
- CI
- Auth
- JS/browser
- UI
- Hosting
- E2E
- workbench
- smaller integration tests

### Quality rule

```text
Muse != lower verification bar
Grok != lower verification bar
```

兩模型永遠走同一 repo-owned：

```text
acceptance
→ tests
→ CI
→ evidence
```

---

## 8. Two-Lane Architecture

### Lane A — Grok 主線

```text
AUTH
INFRA
STAGING
STAFF
WORKBENCH
```

主要模型：

> **Grok 4.6**

### Lane B — Muse 主線

```text
REGISTER
DATA
DOMAIN
BOOKING
RBAC
OUTBOX
```

主要模型：

> **Muse Spark 1.3**

---

## 9. Owner Gate Semantics

新增正式狀態：

```text
INTERRUPT_OWNER_WHEN_READY
```

規則：

> 一旦 owner-gated T0 task 的所有非 owner prerequisites 都滿足，立即向 owner 提出一次授權要求。

然後：

> 不等待，繼續下一個 dependency-independent READY task。

因此：

```text
T0-DEP-02
T0-SMK-01
T1-AUTH-03
T4-DEP-01
T4-SMK-01
```

**不應因為 BLOCKED 就排到施工 queue 最尾端才理它。**

---

## 10. Lane A — Auth / Infra

### T0-CI-01 — exact-main CI rerun

#### Objective

重跑：

```text
33848396940
```

failed jobs。

#### 不允許

- code change
- waiver
- audit disable
- dependency change

#### State

```text
READY
```

#### Model

```text
Grok 4.6 High
```

#### Acceptance

```text
Verification evidence
SUCCESS
on exact SHA
```

如果相同 npm advisories timeout：

```text
external failure
→ same-SHA retry
→ maximum 3 attempts total
```

超過 retry budget 仍為同一外部故障時，如實標記 externally blocked；不 waiver、不製造空 commit，並繼續其他 READY 工作。

若真正出現 advisory：

```text
new SCM defect
```

---

### T0-DEP-01 — Runtime Update Primitive

#### Model

```text
Grok 4.6 xhigh
Alternate: Muse 1.3 xhigh
```

#### Objective

新增：

```text
cal-pilot-runtime-update.ps1
```

或等價 reusable runtime update primitive。

#### Scope

可更新：

```text
API
Hosting
optional Worker
```

禁止隱含：

```text
legacy migration
full resync
schema migration
```

#### AuthDomain

參數化：

```text
CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN
```

允許：

```text
default firebaseapp.com
explicit authorized preview host
```

#### Critical amendment：rollback baseline 不寫死

不得把：

```text
api-00003-muy
worker-00003-nuf
Hosting 09ca...
```

永久硬編進 script。

這些只能是：

```text
authorized expected baseline
/
deployment input
/
preflight observed state
```

流程：

```text
discover current state
↓
compare with authorized expected baseline
↓
drift?
  yes → abort
  no  → continue
```

第一次成功 deployment 後 script 仍必須能正常重用。

#### Required protections

```text
exact commit
Cloud Build immutable digest
review-only default
explicit ConfirmApply
0% revision health probe
traffic switch
Hosting release
rollback output
secret version preservation
baseline drift abort
```

#### PowerShell execution contract（v1.3 hardening）

Repository deployment scripts 以 **PowerShell 7+ (`pwsh`)** 為目標 runtime；不得假設 Windows PowerShell 或 Windows host。

apply 前 preflight 至少確認：

- `pwsh` version
- `gcloud` CLI
- Firebase CLI
- required authentication
- Cloud Build availability
- expected Firebase / GCP project identity

若既有 repo-owned primitive 真的含 Windows-only dependency：

- 不得默默重寫 deploy semantics
- 在目前 host 標記 `UNAVAILABLE`
- 改用經授權且相容的 execution host

Policy/unit tests 應可在不觸發 cloud mutation 的情況下執行。

#### Exact-SHA artifact provenance（v1.2 provenance hardening，v1.3 保留）

The runtime-update workflow MUST maintain a single immutable deployment
candidate identity.

IMAGE BUILD：

- MUST reuse `scripts/cal-pilot-build-images.ps1`，
  或其所委託的 repo-owned primitive。
- 不得在 `cal-pilot-runtime-update.ps1` 內獨立重寫／複製其 exact-commit
  Cloud Build 語意。
- 產出的 image digest 必須可追溯到 exact deployment-candidate SHA。
- 若 candidate SHA 無法確立或重現，script 必須 fail closed。

HOSTING：

Firebase Hosting MUST be deployed from repository content belonging to the
same exact deployment-candidate SHA。至少包含：

- `firebase.json`
- Hosting assets
- 該 release 預定的 generated/static artifacts

Hosting deploy MUST NOT 靜默吃掉 caller mutable working tree 裡的
`firebase.json`、public assets 或其他 release inputs。

dirty working tree、更新的本機檔案、無關的 checkout 狀態，都不得改變
candidate SHA 對應的 Hosting release。

實作可用 isolated exact-SHA checkout、worktree、archive／materialization
step，或等價的 repo-owned reproducible mechanism。
以 mechanism 為準，不以特定實作手法為準。

PR #55 的 CSP 行為屬於 Hosting configuration，因此必須由部署所用的
exact-SHA Hosting source 攜帶。

PROVENANCE INVARIANT：

traffic mutation 之前：

```text
candidate SHA
= CI-verified SHA
= Cloud Build source SHA
= image provenance SHA
= Hosting source SHA
```

部署後必須記錄：

- candidate SHA
- CI run／evidence
- image digest
- deployed API revision
- Hosting release／version
- rollback-before API revision
- rollback-before Hosting version

任何 mismatch MUST abort before mutation。

#### Acceptance

Policy tests 至少涵蓋：

- no Confirm → no mutation
- baseline mismatch → abort
- unsupported authDomain → abort
- exact commit required
- migration command impossible
- full resync impossible
- Worker untouched by default
- rollback state printed/recorded
- image digest traceable to candidate SHA or abort
- Hosting source pinned to candidate SHA (working-tree inputs rejected)

---

### T0-CI-02 — AUTH DEPLOYMENT CANDIDATE EXACT-SHA VERIFICATION（v1.2 provenance hardening，v1.3 保留）

#### State

```text
WAITING until an exact deployment-candidate SHA exists
```

#### Model

```text
Grok 4.6 High
```

#### Purpose

Establish CI evidence for the exact commit that will actually be deployed,
not merely for its historical base commit.

T0-CI-01 證明 baseline `9e1be1a` 的失敗只是外部 npm registry timeout；
本 gate 證明真正要部署的新 commit 是綠的。兩者不混為一談。

#### Prerequisites

- T0-DEP-01 implementation complete
- 所有預定納入首次 Auth 部署的變更已固定為同一個 exact commit SHA

#### Required invariant

```text
deploymentCandidateSha
=
ciVerifiedSha
=
imageSourceSha
=
hostingSourceSha
=
stagingDeployedSha
```

T0-DEP-02 可執行之前：

```text
Verification evidence MUST be SUCCESS for deploymentCandidateSha exactly
```

祖先 SHA 的綠燈不得滿足本 gate。

#### Do not

- waive a failed gate
- substitute local verification for required CI evidence
- deploy a working-tree state that differs from deploymentCandidateSha

CI 若因已確認的 transient external service failure 而紅：
如實分類，並在 SAME SHA 上 rerun。

#### Transient CI retry budget（v1.3 hardening）

同一 exact SHA **最多 3 attempts total**（首次 + 最多 2 次 retry）。

若 attempt 3 後仍是相同、已確認的 external/transient failure：

- 標記該 exact SHA 的 required CI evidence 為 externally blocked / unavailable
- 不加 waiver、不降低 gate
- 不製造無意義 code change 來換新 SHA
- 繼續 dependency-independent READY work
- 當 deployment 其餘 prerequisites 已滿足時，向 owner 顯示 blocker
- `T0-DEP-02` 仍不得 actionable

CI 若暴露 repository defect：
T0-DEP-02 保持 blocked，直到 defect 修復、且新的 exact candidate SHA
拿到成功的 Verification evidence。

---

### T0-DEP-02 — First Auth Staging Deployment

狀態：

```text
INTERRUPT_OWNER_WHEN_READY
```

Dependencies（v1.2 provenance hardening，v1.3 保留）：

```text
T0-DEP-01 complete
exact deploymentCandidateSha established
T0-CI-02 Verification evidence SUCCESS on deploymentCandidateSha
exact-SHA image + Hosting provenance preflight PASS
fresh owner staging mutation authority
```

一滿足：

> **立刻找 owner。**

不等待其他 task。

#### Required authorization

綁定：

```text
exact commit
Firebase project
channel
allowed actions
expiry
rollback baseline
```

---

### T0-SMK-01 — Auth Smoke

狀態：

```text
INTERRUPT_OWNER_WHEN_READY
```

Owner 執行 credential/TOTP 部分。

Agent 可紀錄 evidence。

#### 必測

```text
Google sign-in
callback
TOTP
POST calendar-session 201
__session stored
calendar/status 200
reload remains authenticated
logout
protected request 401
incognito fresh profile starts with no authenticated app/session state
incognito completes the same callback + TOTP flow independently
incognito reload preserves only its own valid session
incognito logout returns protected request to 401
no auth/session state leaks between normal and incognito profiles
```

禁止記錄：

- TOTP secret
- QR
- cookie value
- token

#### Conditional branch

若：

```text
redirect callback
→ null / back to login
```

啟動：

```text
T1-AUTH-03
```

---

### T1-AUTH-03 — Option 1

狀態：

```text
CONDITIONAL
INTERRUPT_OWNER_WHEN_READY
```

需要：

- evidence from smoke
- owner OAuth console authority

處理：

```text
authDomain = preview host
OAuth redirect URI
= https://<preview-host>/__/auth/handler
```

但必須同時驗證：

- Firebase authorized domain
- actual callback path
- authDomain
- OAuth client redirect
- preview host behavior

不得把：

> 「加 redirect URI」

直接假設為唯一剩餘 root cause。

---

### T1-AUTH-01 — Auth boot lifecycle

#### Model

```text
Grok 4.6 High
```

#### Scope

`calendar-pilot-entry`

加入：

```text
getRedirectResult
+
first onAuthStateChanged resolution
```

在 auth state 未定前：

```text
do not render login decision
```

並支援 fake auth injection tests。

---

### T1-AUTH-02 — Cache-Control

#### Model

```text
Grok 4.6 High
```

所有：

```text
/v1/*
```

authenticated/dynamic response：

```text
Cache-Control: private, no-store
```

需 `app.inject` / unit evidence。

---

### T1-FD-01 — `/staff`

#### Model

```text
Grok 4.6 xhigh
```

#### Target

```text
/
→ 302 /clinic

/staff
→ staff workbench
```

`/staff`：

```text
noindex
```

需同步：

- Firebase Hosting
- local parity server
- E2E support
- `check:pages`
- deep link behavior

---

### T1-API-02 — Session Integration

#### Model

```text
Grok 4.6 High
```

測：

```text
suspended user
→ next request 401

idle timeout
absolute timeout
logout
```

必須走實際 authenticate path。

---

### T2-WB-01 — Workbench feedback states

#### Model

```text
Grok 4.6 High
```

補：

- empty
- loading
- success
- permission denied

可被 E2E 精確 assert。

---

### T2-WB-02 — Workbench semantics

#### Model

```text
Grok 4.6 High
```

- 不顯示 appointment internal ID
- overview = 今日工作

---

### T2-WB-03 — Deep-link restore

#### Model

```text
Grok 4.6 High
```

驗證：

```text
/staff#workspace
refresh
back
forward
```

state restore。

---

## 11. Lane B — Register / Booking / Domain

### T0-REG-01 — Register reconciliation

#### Model

```text
Muse 1.3 High
```

將 Q1–Q22 寫成：

```text
Recorded Owner Input
Synthetic / staging build direction
```

但：

> **不得自行把 pending → approved**

因此：

```text
D-004
D-005
D-011
```

狀態不得因這次 reconciliation 自動升級。

#### 同步 synthetic baseline

包含：

- cancel A
- 10:00 cutoff
- one month horizon
- capacity 1
- active limit 2
- med aesthetics hidden
- no-show record only

---

### T1-DOC-01 — Roadmap truth fix

#### Model

```text
Grok 4.6 High
```

修 roadmap false claims：

```text
DATA-R01
DATA-R02
ARC-R01
```

不得再標已完成。

---

### T1-DATA-01 — Release / Rebook

#### Model

```text
Muse 1.3 xhigh
```

修：

```text
reservationId: null
```

與：

```text
!== undefined
```

語意衝突。

#### Mandatory reservationId read/write audit（v1.3 hardening）

修改 `reservationId` released semantics 前，先找出 repository 內所有 authoritative read/write point，至少分類：

- existence check
- `undefined` check
- `null` check
- equality check
- serialization / fixture
- restore / migration / snapshot behavior

不得只修 write path。每個 read path 都必須證明與 canonical released representation 相容後，DATA-R01 才可完成。

#### Required compatibility

既有 `null` 資料：

> 必須安全視為 unreserved。

新 release：

優先：

```text
FieldValue.delete()
```

或等價 canonical normalization。

#### Acceptance

同一 slot：

```text
book
cancel/release
book again
```

成功。

且：

```text
8 concurrent reservation attempts
→ exactly one winner
```

仍成立。

---

### T1-DATA-02 — Occurrence Identity

#### Model

```text
Muse 1.3 xhigh
```

#### 禁止

只做：

```text
requestedAt hash
```

作為 event identity。

#### Required invariant

```text
same logical retry
→ same event identity

new transition occurrence
→ new event identity
```

優先：

```text
transitionVersion
occurrenceId
existing idempotency key
```

#### Transaction-owned occurrence/version invariant（v1.3 hardening）

```text
transitionVersion / occurrenceVersion MUST be allocated or advanced inside
the same authoritative transaction that commits:

appointment state
+ audit occurrence
+ outbox occurrence

A version advances only for a newly committed logical transition.

Retrying the same logical operation under the same idempotency identity MUST
reuse the same occurrence identity rather than allocate another occurrence.
```

#### Acceptance

至少測：

```text
confirmed
→ cancellation_requested
→ confirmed
→ cancellation_requested
```

產生：

```text
2 distinct cancellation occurrences
```

且 retry 不產生 duplicate audit/outbox。

---

### T1-BOOK-02 — Horizon / Catalogue

#### Model

```text
Muse Spark 1.3 xhigh
Alternate: Grok 4.6 High（僅 UI-only follow-up，不接管 domain ownership）
```

horizon 進 domain。

定義：

> Asia/Taipei 今日 → 下月同日，月底 clamp。

需要 boundary tests：

```text
Jan 31 → Feb 28/29
```

患者 catalogue：

> 暫移除醫美。

若 enum 被 fixture 使用：

> enum 可保留；patient-visible catalogue 移除即可。

---

### T1-BOOK-01 — Cancel / Cutoff

#### Model

```text
Muse 1.3 xhigh
```

新增 domain single source：

```text
selfCancelCutoffAt()
```

規則：

```text
appointment-day
10:00 Asia/Taipei
```

測：

```text
09:59 → allowed
10:00 → denied
```

患者只能：

```text
cancel own appointment
```

---

### T1-BOOK-03 — Active Limit 2

#### Model

```text
Muse 1.3 xhigh
```

#### 核心改動

從：

```text
activeAppointmentId
```

到：

```text
bounded active appointments
max = 2
```

#### Active-limit concurrency invariant（v1.3 hardening）

不要預先指定一定要新增 counter document。真正 authoritative 的要求是：

```text
For each patient, every transaction that can change the number of unfinished
appointments MUST contend on one authoritative patient-level guard state.

create:
  atomically observe current active state
  and add exactly one only when resulting active count <= 2

terminal cancel / complete / no-show:
  atomically release exactly one active allowance

reschedule:
  MUST be count-neutral
  MUST NOT temporarily consume a third active allowance

retry:
  MUST NOT double-increment or double-decrement active state

legacy activeAppointmentId representation:
  MUST remain readable and normalize safely on mutation
```

實作可使用 bounded ID set、count+IDs、或等價 representation；只要 canonical patient guard 本身提供跨 slot 的 contention point，就**不強制**額外 counter document。

#### Mandatory backward compatibility

Legacy guard documents 必須：

```text
remain readable
```

第一次 mutation：

```text
normalize safely
```

不得要求 destructive migration。

需測：

- old representation read
- old → new normalization
- 2 active succeeds
- 3rd rejected
- one completes/cancels → new booking allowed
- concurrent across slots → max 2 winners
- reschedule does not consume an additional active allowance at any point
- retry of create/release does not double-increment or double-decrement active state

---

### T1-BOOK-04 — Reschedule

#### Model

```text
Muse 1.3 xhigh
```

沿用：

```text
reserve new
then release old
inside same atomic operation
```

新 slot 衝突：

```text
old booking unchanged
```

患者需：

```text
reschedule own only
```

並受：

- cutoff
- horizon
- permissions

---

### T1-API-01 — Server RBAC Evidence

> **Ordering decision retained in v1.3:** 不提前到 DATA-01 後。先讓 BOOK-01 / BOOK-03 / BOOK-04 的 permission 與 mutation contract 穩定，再建立 controller-level RBAC evidence，避免重做共享 contract。

#### Model

```text
Muse 1.3 xhigh
```

#### 建立

```text
AppointmentController
```

但：

> **禁止掛進 production AppModule**

#### Test-only Nest module

透過：

```text
app.inject
```

驗：

```text
anonymous → 401
suspended → 401
patient other resource → 403
physician unauthorized mutation → 403
front desk restricted action → 403
manager allowed action → 2xx
```

#### Safety acceptance

現有：

```text
/v1/bookings
→ 404
```

production unrouted behavior 必須保持。

---

### T1-ARC-01 — Outbox Fencing

#### Model

```text
Muse 1.3 xhigh
```

claim：

```text
leaseOwner
generation
```

v1.3 hardening：每次成功 reclaim / ownership transfer 時，`generation` 必須在**同一 claim transaction** 中原子遞增。同一有效 owner 的 lease renewal 不得憑空創造新的 logical event。

settle：

```text
transaction
+
compare owner/generation
```

settle authorization：

```text
leaseOwner == claimant
AND
generation == generation observed at claim time
```

stale holder：

```text
must not overwrite
```

---

### T1-PILOT-01 — CAL-PILOT Concurrency Proof

#### Model

```text
Muse Spark 1.3 xhigh
Alternate: Grok 4.6 xhigh
```

#### 現階段狀態

```text
PARTIAL / UNVERIFIED
```

不是 ENFORCED。

#### Test

兩個 concurrent：

```text
same bookingKind
overlapping interval
```

預期：

```text
1 success
1 ConflictError
```

不同 bookingKind：

若設計允許：

```text
both success
```

#### Failure escalation

若：

```text
both same-kind overlapping writes succeed
```

則：

```text
STOP
→ classify critical correctness defect
→ architecture fix before staging acceptance
```

---

### T2-GOV-01 — BOOK-PILOT Proposal

#### Model

```text
Muse 1.3 xhigh
```

Grok 可做第二遍 proofread。

僅：

```text
proposal
```

不得：

- 改 Decision Register approval
- 改 capability gate
- route booking API

內容需有：

- scope
- exclusions
- synthetic-only
- expiry
- kill switch
- rollback
- evidence
- required gate changes

---

### T3-Q-01 — Quality coverage

#### Model

```text
Grok 4.6 High
```

針對：

```text
/staff
patient reschedule
```

補：

- axe
- mobile 360
- mobile 390
- overflow
- perf budget

---

## 12. Final RC

### T4-RC-01

#### RC_REQUIRED_SET（v1.3 hardening）

RC candidate 只有在下列 staging-critical work 完成後才可固定：

**Lane A**
- T1-AUTH-01
- T1-AUTH-02
- T1-FD-01
- T1-API-02
- T2-WB-01
- T2-WB-02
- T2-WB-03

**Lane B**
- T0-REG-01
- T1-DATA-01
- T1-DATA-02
- T1-BOOK-01
- T1-BOOK-02
- T1-BOOK-03
- T1-BOOK-04
- T1-API-01
- T1-ARC-01
- T1-PILOT-01

**Quality**
- T3-Q-01 **是 RC gate**

`T2-GOV-01`：草案完成建議保留，但**預設不阻塞本次 VERIFIED STAGING RC**；只有 current repository authority 明確把 next-wave proposal 列為 release condition 時才升格為 RC prerequisite。

`T1-AUTH-03`：只有 `T0-SMK-01` 的實證顯示 Option 1 確實必要時才阻塞 RC。

除上述集合外，不得以模糊的「所有 T1/T2」臨時擴張 RC scope；若 current authority 改變則依 authority 更新。

執行：

```text
exact-head Verification evidence
```

必須：

```text
SUCCESS
```

模型：

```text
Grok 4.6 High
```

---

### T4-DEP-01

狀態：

```text
INTERRUPT_OWNER_WHEN_READY
```

RC CI 一綠：

> 立即找 owner。

使用相同 guarded runtime update primitive。

---

### T4-SMK-01

狀態：

```text
INTERRUPT_OWNER_WHEN_READY
```

#### Smoke coverage

##### Auth

- Google sign-in
- callback
- TOTP
- `__session`
- reload persistence
- logout → 401

##### Public

```text
/
→ /clinic
```

##### Staff

```text
/staff
```

##### Booking staging smoke boundary（v1.3 hardening）

本次 VERIFIED STAGING 的 booking smoke **只能**走目前已授權的 synthetic browser/staging path。

`T1-API-01 AppointmentController` 仍維持 unrouted：

- 不得 import 進 production `AppModule`
- 不得 expose `/v1/bookings`
- 不得為了讓 smoke 綠而改 capability gates
- `/v1/bookings` 必須維持 404，除非另有 current authority 明確批准 route

本 release 的 server-side booking evidence 來源固定為：

```text
app.inject RBAC contract tests
+ domain tests
+ Firestore Emulator tests
+ authorized synthetic browser smoke
```

##### Booking synthetic

- initial
- follow-up
- lookup
- cancel
- 10:00 cutoff
- reschedule
- horizon
- catalogue
- limit 2

##### CAL-PILOT

- unauth 401
- status authenticated
- candidate data behavior

##### Recovery

rollback preflight：

```text
PASS
```

---

## 13. VERIFIED STAGING Definition

必須同時滿足：

### Code

```text
exact RC SHA
```

### CI

```text
Verification evidence
SUCCESS
```

### Artifact provenance

API image：

```text
built from exact RC SHA
immutable digest recorded
```

Hosting：

```text
exact release/version recorded
```

### Release invariant — provenance chain（v1.2 起，v1.3 保留）

```text
Current authority
      ↓
exact candidate SHA
      ↓
Verification evidence SUCCESS
      ↓
exact-SHA Cloud Build
      ↓
immutable image digest
      ↓
exact-SHA Hosting source
      ↓
fresh owner authorization
      ↓
deployment
      ↓
dated smoke evidence
      ↓
VERIFIED STAGING
```

### Deployment

rollback-before state captured。

### Smoke

所有 critical smoke：

```text
PASS
```

任何：

```text
FAIL
```

→ 不得標 VERIFIED STAGING。

### Safety

- no production
- no real patient data
- no secrets
- no waiver
- no reduced gate

### Evidence language

程式仍使用既有 rung：

```text
CI-VERIFIED
```

staging smoke：

> dated deployment/smoke evidence

不得自行創造新的 Canon evidence rung。

---

## 14. Deliberately Deferred

以下**不阻塞本次 VERIFIED STAGING**：

- local account + formal TOTP fallback IdP
- delegated deletion backend
- requeue HTTP API
- full API-backed browser E2E
- surgery module
- payment/payroll
- multiple-service booking contract
- no-show automation
- human accessibility study
- Terraform
- production
- Governance v3

---

## 15. Final Two-Lane Queue

### 🟦 Lane A — Grok 4.6

```text
T0-CI-01
│
├───────────────┐
│               │
T0-DEP-01       │
│               │
└── ready ──────┴─→ OWNER: T0-DEP-02
                       ↓
                   T0-SMK-01
                       │
              callback issue?
                 │           │
                YES          NO
                 ↓
            T1-AUTH-03

Meanwhile:

T1-AUTH-01
↓
T1-AUTH-02
↓
T1-FD-01
↓
T1-API-02
↓
T2-WB-01
↓
T2-WB-02
↓
T2-WB-03
↓
T3-Q-01
```

### 🟩 Lane B — Muse Spark 1.3

```text
T0-REG-01
↓
T1-DATA-01
↓
T1-DATA-02
↓
T1-BOOK-01
↓
T1-BOOK-03
↓
T1-BOOK-04
↓
T1-API-01
↓
T1-ARC-01
↓
T2-GOV-01
```

Lane B 內可依 dependency / file ownership 插入：

```text
T1-BOOK-02   # Muse 1.3 xhigh
T1-PILOT-01  # Muse 1.3 xhigh
```

跨 Lane 的獨立 doc-only task：

```text
T1-DOC-01    # Grok 4.6 High；不得與 Lane B 同時改同一 authority/contract file
```

但仍遵守：

> shared contract ownership 不能同時改。

---

## 16. MASTER QUEUE

| # | Task | State | Primary | Effort | Dependency |
|---:|---|---|---|---|---|
| 1 | T0-CI-01 exact-main rerun | READY | **Grok 4.6** | High | — |
| 2 | T0-DEP-01 exact-SHA runtime-update primitive | READY | **Grok 4.6** | xhigh | — |
| 3 | T0-REG-01 register reconciliation | READY | **Muse 1.3** | High | — |
| ⚡ | T0-CI-02 Auth deployment candidate exact-SHA CI | WAITING FOR CANDIDATE | **Grok 4.6** | High | T0-DEP-01 + candidate fixed |
| 4 | T1-DOC-01 roadmap truth fix | READY | **Grok 4.6** | High | — |
| 5 | T1-AUTH-01 auth boot lifecycle | READY | **Grok 4.6** | High | — |
| 6 | T1-DATA-01 rebook released slot | READY | **Muse 1.3** | xhigh | — |
| 7 | T1-BOOK-02 horizon/catalogue | READY | **Muse 1.3** | xhigh | REG |
| 8 | T1-AUTH-02 no-store | READY | **Grok 4.6** | High | — |
| 9 | T1-DATA-02 occurrence identity | READY | **Muse 1.3** | xhigh | DATA-01 |
| 10 | T1-FD-01 `/staff` | READY | **Grok 4.6** | xhigh | — |
| 11 | T1-BOOK-01 cancel/cutoff | READY | **Muse 1.3** | xhigh | REG + DATA-01 |
| 12 | T1-API-02 session tests | READY | **Grok 4.6** | High | — |
| 13 | T1-BOOK-03 max 2 + legacy compatibility | READY | **Muse 1.3** | xhigh | BOOK-01 |
| 14 | T1-PILOT-01 overlap race proof | READY | **Muse 1.3** | xhigh | — |
| 15 | T1-BOOK-04 reschedule | READY | **Muse 1.3** | xhigh | BOOK-03 + DATA-02 |
| 16 | T2-WB-01 feedback states | READY | **Grok 4.6** | High | — |
| 17 | T1-API-01 unrouted RBAC controller/tests | READY | **Muse 1.3** | xhigh | BOOK-04 |
| 18 | T2-WB-02 semantics | READY | **Grok 4.6** | High | — |
| 19 | T1-ARC-01 lease fencing | READY | **Muse 1.3** | xhigh | — |
| 20 | T2-WB-03 deep-link | READY | **Grok 4.6** | High | FD-01 |
| 21 | T2-GOV-01 BOOK-PILOT proposal | READY | **Muse 1.3** | xhigh | API-01 |
| 22 | T3-Q-01 quality coverage | READY | **Grok 4.6** | High | FD-01 + BOOK-04 |
| ⚡ | T0-DEP-02 Auth deploy | **INTERRUPT OWNER WHEN READY** | Owner | — | T0-CI-02 + provenance preflight |
| ⚡ | T0-SMK-01 Auth smoke | **INTERRUPT OWNER WHEN READY** | Owner | — | DEP-02 |
| ⚡ | T1-AUTH-03 Option 1 | CONDITIONAL OWNER | Grok + Owner | High | Smoke failure |
| 23 | T4-RC-01 exact RC CI | WAITING | **Grok 4.6** | High | critical work merged |
| ⚡ | T4-DEP-01 RC deploy | **INTERRUPT OWNER WHEN READY** | Owner | — | RC CI |
| ⚡ | T4-SMK-01 final smoke | **INTERRUPT OWNER WHEN READY** | Owner + Grok/Muse evidence | — | RC deploy |

---

## 17. Autonomous Agent Rule

給 Muse / Grok 的共同規則：

```text
Always select the highest-priority READY task whose dependencies are satisfied
and whose file/contract ownership does not conflict with the other active lane.

Do not wait idle for:
- CI
- owner approval
- staging
- external service availability

When blocked:
record the blocker
then immediately continue the next independent READY task.

For transient CI failures, respect the exact-SHA retry budget; never poll or rerun indefinitely.

When an INTERRUPT_OWNER_WHEN_READY task becomes actionable:
surface the authorization request once
then continue independent work while waiting.

Never:
- merge without owner authorization
- deploy without fresh owner authorization
- alter Decision Register approval state without authority
- weaken CI
- add waiver to silence external failure
- route currently disabled production APIs
- treat frontend permissions as server authorization
- claim a test passed when it was not run
- route `T1-API-01` / `/v1/bookings` merely to make staging smoke green
- treat a retry-generated timestamp as sufficient occurrence identity
- change reservationId write semantics before auditing authoritative read paths
- run deployment apply from an unverified mutable working tree
- assume `.ps1` requires Windows when PowerShell 7+ `pwsh` is available
```

---

## 18. Construction Model Contract

### Muse

```text
Muse Spark 1.3
highest actually supported free reasoning
prefer xhigh
```

主攻：

> correctness-heavy work，包含 DATA / DOMAIN / BOOKING / Firestore transaction semantics / RBAC / OUTBOX。

### Grok

```text
Grok 4.6
High default
xhigh for uncertainty / large blast radius
```

主攻：

> tooling / integration / Web / infra。

---

## 19. Final Construction Strategy

```text
                VERIFIED STAGING
                       ▲
                       │
              exact RC + smoke
                       │
       ┌───────────────┴───────────────┐
       │                               │
   Grok 4.6                        Muse 1.3
   Lane A                          Lane B
       │                               │
 Auth / Infra                     Data / Domain
 Staff / UI                       Booking / RBAC
 CI / Staging                     Transaction / Outbox
       │                               │
       └──────── repo-owned gates ─────┘
```

**不再找第三個施工模型。**

**v1.3 freeze rule：** 除非 current authority 或新 evidence 推翻 dependency / invariant assumption，不得再以純審查意見重新打散 queue。

規劃凍結。後續只有當 current evidence 真正推翻 dependency 或 architecture assumption 時才重新排程，不因每個 PR 完成就重新規劃整份。

---

## 20. Hermes 新聊天室啟動指令

讀取本文件後：

1. 先驗證 current `origin/main`、authority、open PR / active worktree 狀態。
2. 本文件是 execution context，不是 repository Canon。
3. 若 current authority 與本文件衝突，current authority wins。
4. 若 current evidence 已使某 task DONE / OBSOLETE / BLOCKED，更新 queue，不重做。
5. 只使用：
   - **Muse Spark 1.3**
   - **Grok 4.6**
   作為施工模型。
6. 最多兩個 implementation worktrees：
   - Lane A = Grok
   - Lane B = Muse
7. 依 dependencies 選 READY task，自主施工、targeted verification、diff review、PR preparation。
8. Owner gate 只在：
   - merge authorization
   - staging mutation authorization
   - OAuth/console
   - credentials/TOTP
   - unresolved business/legal/clinical authority
   - irreversible external action
9. `INTERRUPT_OWNER_WHEN_READY` 一旦可執行，立刻回報 owner 一次，之後繼續其他 READY 工作。
10. 不等待，不輪詢，不因單一 blocker 停工。
11. `T1-BOOK-02` 與 `T1-PILOT-01` 由 **Muse Spark 1.3 xhigh** 主責；不要跨回 Grok 的 Lane A DOMAIN ownership。
12. `T1-API-01` 排序維持在 BOOK contracts 穩定後；不得為了 smoke 提前 route。
13. `T0-CI-01` / `T0-CI-02` 相同 exact SHA 的 transient CI failure 最多 3 attempts total；超額後標記 external blocker，不 waiver。
14. `T4-RC-01` 僅依 §12 `RC_REQUIRED_SET` 准入；`T3-Q-01` 是 RC gate，`T2-GOV-01` 預設不是。
15. `.ps1` 以 PowerShell 7+ `pwsh` 為 runtime contract，不假定 Windows。

開始前不要重新做整份 Master Planning。

先做最小 current-state reconciliation，然後直接執行最高優先級 READY task。
