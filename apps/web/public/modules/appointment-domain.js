import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_KINDS,
  BOOKING_NOTE_TAGS,
  DELETE_APPOINTMENT_REASONS,
  FOLLOW_UP_NOTE_TAGS,
  PATIENT_REQUEST_TAGS,
  PATIENT_SERVICES,
  PATIENT_SOURCE_TAGS,
  SOURCE_TAGS_NEEDING_REFERRER,
  WORKBENCH_PROCEDURES
} from './constants.js';
import {
  ensureReschedulable,
  ensureSlotBookable,
  ensureTransitionAllowed,
  ensureWithinActiveBookingLimit
} from './domain-rules.js';
import { identityKey, upsertPatient } from './patient-registry.js';
import { followUpDueTimes } from './schedule-engine.js';
import { taipeiIso } from './taipei-time.js';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp
} from '../vendor/domain/calendar-event-id.js';

const MAX_NOTE_LENGTH = 120;
const MAX_CERTIFICATE_COPIES = 10;

function appendAudit(state, action, appointmentId, actorId, details = {}) {
  state.auditEvents.push({
    id: `audit_${appointmentId}_${action}_${Date.now()}`,
    action,
    appointmentId,
    actorId,
    occurredAt: new Date().toISOString(),
    ...details
  });
}

function appendOutbox(state, appointment) {
  state.outboxJobs.push({
    id: `outbox_${appointment.id}_${appointment.status}_${Date.now()}`,
    type: 'calendar_projection_requested',
    appointmentId: appointment.id,
    appointmentStatus: appointment.status,
    // 預覽的投影意圖不會真的送到日曆，但鍵仍由共用產生器產生：格式只有
    // 一個來源，預覽看到的就是正式路徑會用的鍵（ADR-0002、ADR-0004）。
    idempotencyKey: calendarEventIdForAppointment(appointment.id),
    status: 'pending'
  });
}

function replaceFollowUpProjection(
  state,
  appointmentId,
  appointmentStatus,
  startsAt
) {
  // 回診提醒使用獨立 event ID。瀏覽器預覽只保留同一來源的最新投影意圖，
  // 避免調整日期後，舊的 pending 工作又把提醒搬回過期時間。
  state.outboxJobs = state.outboxJobs.filter(
    (job) => job.followUpSourceId !== appointmentId
  );
  state.outboxJobs.push({
    id: `outbox_followup_${appointmentId}_${Date.now()}`,
    type: 'calendar_projection_requested',
    appointmentId,
    appointmentStatus,
    followUpSourceId: appointmentId,
    ...(startsAt === undefined ? {} : { startsAt }),
    idempotencyKey: calendarEventIdForFollowUp(appointmentId),
    status: 'pending'
  });
}

// 以下兩個函式是**合成示範**：工作臺不真的呼叫 Google。權威的重試、退避、
// 死信與冪等在 apps/worker（Emulator 已驗證）；這裡只把操作者會用到的兩個
// 動作畫出來——一次同步的成敗，以及死信的重新排入。
export function simulateCalendarSync(state, fail, actorId) {
  const pending = state.outboxJobs.filter((job) => job.status === 'pending');
  if (pending.length === 0) throw new Error('目前沒有待同步的日曆投影工作。');
  for (const job of pending) {
    if (fail) {
      job.status = 'dead_letter';
      job.needsOperator = true;
      job.lastError = '合成失敗：外部日曆連續失敗，已進入死信。';
      appendAudit(
        state,
        'calendar_projection_dead_lettered',
        job.appointmentId,
        actorId
      );
    } else {
      job.status = 'completed';
      delete job.needsOperator;
      delete job.lastError;
      appendAudit(
        state,
        'calendar_projection_synced',
        job.appointmentId,
        actorId
      );
    }
  }
  return pending.length;
}

export function requeueOutboxJob(state, jobId, actorId) {
  const job = state.outboxJobs.find((item) => item.id === jobId);
  if (job === undefined) throw new Error('找不到這筆日曆投影工作。');
  // 只作用於死信，對映 apps/worker 的 requeue：正在跑或已完成的工作不可人工插手。
  if (job.status !== 'dead_letter')
    throw new Error('只有死信工作可以重新排入。');
  job.status = 'pending';
  job.needsOperator = false;
  job.requeuedBy = actorId;
  job.requeuedAt = new Date().toISOString();
  delete job.lastError;
  appendAudit(
    state,
    'calendar_projection_requeued',
    job.appointmentId,
    actorId
  );
}

function optionalNote(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_NOTE_LENGTH)
    throw new Error(`備註不可超過 ${MAX_NOTE_LENGTH} 個字元。`);
  return text;
}

function selectedTags(value, allowed, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label}格式不正確。`);
  const ids = new Set(allowed.map((tag) => tag.id));
  for (const tag of value) {
    if (!ids.has(tag)) throw new Error(`${label}包含未定義的選項。`);
  }
  return [...new Set(value)];
}

// 介紹人姓名是**第三人**的個資：那個人並不在現場，也沒有被告知。因此只在真的
// 勾了「親友介紹／員工介紹」時才收，其餘一律丟掉——不是丟錯誤，因為使用者可能
// 只是先勾後取消，而畫面上那個欄位當下已經收起來了。
function referrerName(value, sourceTags) {
  const needed = sourceTags.some((tag) =>
    SOURCE_TAGS_NEEDING_REFERRER.includes(tag)
  );
  if (!needed) return '';
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 30) throw new Error('介紹人姓名不可超過 30 個字元。');
  return text;
}

/**
 * 病歷號碼（W4，業主 2026-07-27）。
 *
 * 2026-07-27 與負責人確認過它究竟是什麼：**診所自己編的流水號**。不是健保署
 * 核發的（健保署發的是醫事機構代碼與健保卡卡號，識別病人用身分證字號），也不是
 * 健保卡上的卡號。醫療法與施行細則只規定病歷要記什麼、保存多久，**沒有規定編號
 * 方式**，所以編碼規則由各院所自訂。
 *
 * 實作上的兩個結論：
 *   1. 它就是一段文字，**沒有格式可驗，也不該自作聰明去驗**——猜錯規則的後果是
 *      拒絕診所自己的號碼；
 *   2. 它不是從健保卡抄來的敏感識別碼，所以清單上**不遮罩**（與身分證不同）。
 *
 * 長度上限純粹是防呆，不是規則。
 */
function medicalRecordNumber(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 20) throw new Error('病歷號碼不可超過 20 個字元。');
  return text;
}

function certificateCopies(value) {
  if (value === undefined || value === '' || value === null) return 0;
  const copies = Number(value);
  if (
    !Number.isInteger(copies) ||
    copies < 0 ||
    copies > MAX_CERTIFICATE_COPIES
  )
    throw new Error(`診斷書份數必須是 0 至 ${MAX_CERTIFICATE_COPIES} 的整數。`);
  return copies;
}

// 一次門診最多登記幾個項目。上限存在的理由不是規則，是防呆：沒有上限的話，
// 一個壞掉的呼叫端可以送進上千個 id，而畫面上那一格會變成一整段文字。
const MAX_ITEMS = 6;

/**
 * 看診項目（W5，業主 2026-07-27：可複選）。
 *
 * 輸入是 **id 陣列**，不再是單一 id。存下來的是 `itemIds` 加上一份 `itemLabel`
 * 快照——後者是顯示、搜尋與排序的單一來源，順序跟著選取順序走。
 *
 * **已知的契約缺口**：`packages/domain` 的 `planBooking` 與 `packages/contracts`
 * 的線路 schema 目前仍是單一 `itemId`（那兩者都還沒接線、也還沒核准）。真的要
 * 接 API 時必須一起改成複數，否則多項目的預約在 API 上表達不出來。這一點記在
 * docs/product/2026-07-27-owner-request-batch.md。
 */
function resolveItems(input) {
  const catalogue = [...PATIENT_SERVICES, ...WORKBENCH_PROCEDURES];
  if (!Array.isArray(input)) throw new Error('請選擇看診項目。');
  const unique = [...new Set(input)];
  if (unique.length === 0) throw new Error('請選擇看診項目。');
  if (unique.length > MAX_ITEMS)
    throw new Error(`看診項目最多 ${MAX_ITEMS} 項。`);
  return unique.map((id) => {
    const item = catalogue.find((entry) => entry.id === id);
    if (item === undefined) throw new Error('請選擇看診項目。');
    return item;
  });
}

export function activeBookingsFor(state, patient) {
  const key = identityKey(patient);
  return state.appointments.filter((appointment) => {
    if (!ACTIVE_BOOKING_STATUSES.includes(appointment.status)) return false;
    const owner = state.patients.find(
      (item) => item.id === appointment.patientId
    );
    return owner !== undefined && identityKey(owner) === key;
  });
}

export function createBooking(state, input, actorId) {
  const slot = state.slots.find((item) => item.id === input.slotId);

  const bookingKind =
    input.bookingKind === BOOKING_KINDS.FOLLOW_UP
      ? BOOKING_KINDS.FOLLOW_UP
      : BOOKING_KINDS.INITIAL;

  // 時段可預約與掛號別相符：規則由共用斷言決定（ADR-0004）。
  ensureSlotBookable(slot, bookingKind);

  const items = resolveItems(input.itemIds);
  const noteTags = selectedTags(input.noteTags, BOOKING_NOTE_TAGS, '備註');
  const noteText = optionalNote(input.noteText);
  // 患者自述的三組欄位（2026-07-27 P7／P9）。與櫃台的 noteTags／noteText
  // **分開存**：合成同一欄的話，櫃台一按「修改備註」就會把患者寫的話覆蓋掉，
  // 而且沒有任何痕跡。稽核上也分不出哪一句是誰說的。
  const requestTags = selectedTags(
    input.requestTags,
    PATIENT_REQUEST_TAGS,
    '門診需求'
  );
  const sourceTags = selectedTags(
    input.sourceTags,
    PATIENT_SOURCE_TAGS,
    '訊息來源'
  );
  const referrer = referrerName(input.referrerName, sourceTags);
  const patientNote = optionalNote(input.patientNote);

  // Check the duplicate limit against the submitted identity before the
  // patient record is created, so a repeat attempt cannot slip through by
  // registering first and colliding second.
  const patientDetails = { ...input.patient };
  const active = activeBookingsFor(state, patientDetails);
  if (input.allowDuplicate !== true)
    ensureWithinActiveBookingLimit(active.length);

  const patient = upsertPatient(state, patientDetails);

  let sourceFollowUp;
  if (bookingKind === BOOKING_KINDS.FOLLOW_UP) {
    sourceFollowUp = [...state.followUps]
      .reverse()
      .find(
        (entry) =>
          entry.patientId === patient.id &&
          entry.status === 'required' &&
          entry.scheduledAppointmentId === undefined
      );
    if (input.origin === 'patient' && sourceFollowUp === undefined)
      throw new Error('目前沒有已確認的回診安排，請聯絡櫃台。');
  }

  const suffix = String(state.sequence).padStart(3, '0');
  const appointmentId = `appointment_${suffix}`;
  const now = new Date().toISOString();
  const appointment = {
    id: appointmentId,
    slotId: slot.id,
    startsAt: slot.startsAt,
    patientId: patient.id,
    bookingKind,
    itemIds: items.map((item) => item.id),
    // 顯示、搜尋與排序都讀這一份快照，不是每次重新查表：項目清單改名之後，
    // 已經發生的預約仍應顯示當時登記的名稱。
    itemLabel: items.map((item) => item.label).join('、'),
    noteTags,
    noteText,
    // 空值不寫進紀錄：多數預約不會用到這幾欄，寫一堆空字串只會讓合成狀態變胖，
    // 也讓「有沒有填」在讀取端變成兩種寫法（`=== ''` 與 `=== undefined`）。
    ...(requestTags.length > 0 ? { requestTags } : {}),
    ...(sourceTags.length > 0 ? { sourceTags } : {}),
    ...(referrer === '' ? {} : { referrerName: referrer }),
    ...(patientNote === '' ? {} : { patientNote }),
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
    ...(sourceFollowUp === undefined
      ? {}
      : { sourceFollowUpId: sourceFollowUp.appointmentId })
  };
  slot.reservationId = appointmentId;
  state.appointments.push(appointment);
  if (sourceFollowUp !== undefined) {
    sourceFollowUp.scheduledAppointmentId = appointmentId;
    // 正式回診預約已有自己的日曆事件；移除先前「尚待安排」的提醒，避免同一
    // 次回診在日曆上同時出現提醒與正式預約。
    replaceFollowUpProjection(
      state,
      sourceFollowUp.appointmentId,
      'follow_up_scheduled'
    );
  }
  appendAudit(state, 'appointment_confirmed', appointmentId, actorId);
  appendOutbox(state, appointment);
  state.sequence += 1;
  return appointment;
}

export function transitionAppointment(state, appointmentId, action, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');
  const slot = state.slots.find((item) => item.id === appointment.slotId);
  const now = new Date().toISOString();

  // 「到診」有兩個入口：一般到診，以及到診但忘了帶健保卡（W3）。兩者是**同一個
  // 狀態轉換**，差別只在多記一個這一次的事實，所以動作名對映到同一個 transition。
  const TRANSITIONS = {
    request_cancellation: 'request_cancellation',
    cancel: 'cancel',
    complete: 'complete',
    complete_without_card: 'complete',
    no_show: 'no_show'
  };
  const transition = TRANSITIONS[action];
  if (transition === undefined) throw new Error('不支援的預約動作。');

  // 是否允許這個轉換由共用斷言決定（ADR-0004）。之後的狀態寫入、時段釋出
  // 與稽核是瀏覽器端的機制，維持原樣。
  ensureTransitionAllowed(transition, appointment.status);

  if (transition === 'request_cancellation') {
    appointment.status = 'cancellation_requested';
    appendAudit(state, 'cancellation_requested', appointmentId, actorId);
  } else if (transition === 'cancel') {
    appointment.status = 'cancelled';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_cancelled', appointmentId, actorId);
  } else if (transition === 'complete') {
    appointment.status = 'completed';
    appointment.completedAt = now;
    // 只在真的忘了帶卡時寫這個旗標。一般到診**不**寫 `nhiCardMissing: false`：
    // 那會宣稱一件櫃台沒有回答過的事（他可能根本沒有健保身分）。
    if (action === 'complete_without_card') appointment.nhiCardMissing = true;
    appendAudit(
      state,
      action === 'complete_without_card'
        ? 'appointment_completed_without_nhi_card'
        : 'appointment_completed',
      appointmentId,
      actorId
    );
  } else {
    appointment.status = 'no_show';
    if (slot?.reservationId === appointmentId) delete slot.reservationId;
    appendAudit(state, 'appointment_no_show', appointmentId, actorId);
  }

  appointment.updatedAt = now;
  appendOutbox(state, appointment);
  return appointment;
}

export function rescheduleAppointment(
  state,
  appointmentId,
  targetSlotId,
  actorId
) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');

  const target = state.slots.find((item) => item.id === targetSlotId);
  // 改期規則（狀態尚未結束、目標時段可預約、不可跨掛號別、不可原地）由共用
  // 斷言決定（ADR-0004）。
  ensureReschedulable(
    appointment.status,
    appointment.slotId,
    target,
    appointment.bookingKind
  );

  const previous = state.slots.find((item) => item.id === appointment.slotId);
  if (previous?.reservationId === appointmentId) delete previous.reservationId;
  target.reservationId = appointmentId;
  appointment.slotId = target.id;
  appointment.startsAt = target.startsAt;
  appointment.status = 'confirmed';
  appointment.updatedAt = new Date().toISOString();
  appendAudit(state, 'appointment_rescheduled', appointmentId, actorId);
  appendOutbox(state, appointment);
  return appointment;
}

/**
 * 刪除一筆預約紀錄（管理者限定，對映 domain 的 `planDeletion`）。
 *
 * 與「取消」的界線：取消是**已經發生的營運事實**——患者約了、後來不來了，
 * 這筆必須留在清單上讓人看得到。刪除處理的是**本來就不該存在的紀錄**：重複
 * 建立、掛錯病患、誤建的測試資料。因此刪除把預約移出營運清單，稽核事件卻永久
 * 保留——誰在何時、以什麼理由刪掉哪一筆，仍然查得到。
 *
 * 理由是必填的：紀錄消失後，稽核事件是它存在過的唯一證據。
 */
export function deleteAppointment(
  state,
  appointmentId,
  reasonCode,
  actorId,
  delegation
) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');
  if (!DELETE_APPOINTMENT_REASONS.some((item) => item.id === reasonCode))
    throw new Error('請選擇刪除理由。');

  // 只有尚未結束的預約還佔著時段；取消／未到／完成到診早已釋出，再刪一次
  // reservationId 會把後來訂走這格的人擠掉。
  const slot = state.slots.find((item) => item.id === appointment.slotId);
  if (slot?.reservationId === appointmentId) delete slot.reservationId;

  // 這筆是某次回診決定安排出來的門診：刪掉它不等於病患不必回診，因此把來源
  // 回診放回「待安排」並讓提醒重新上日曆，否則整個回診就此人間蒸發。
  const source = state.followUps.find(
    (item) => item.scheduledAppointmentId === appointmentId
  );
  if (source !== undefined) {
    delete source.scheduledAppointmentId;
    replaceFollowUpProjection(
      state,
      source.appointmentId,
      'follow_up_required',
      taipeiIso(source.dueDate, source.dueTime)
    );
  }

  // 這筆自己的回診決定一併結束：來源就診都不在了，提醒沒有對象。用同一個
  // event ID 排入取消，不能只刪掉本機工作紀錄（日曆那一側還留著事件）。
  const decision = state.followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  if (decision !== undefined) {
    state.followUps = state.followUps.filter(
      (item) => item.appointmentId !== appointmentId
    );
    replaceFollowUpProjection(state, appointmentId, 'follow_up_not_required');
  }

  // 尚未送出的投影意圖必須先撤掉，否則刪除後那些 pending 工作又會把事件建
  // 回日曆。已完成與死信的工作是歷史，保留。回診提醒的工作由上面兩段各自
  // 處理，這裡以 followUpSourceId 排除。
  state.outboxJobs = state.outboxJobs.filter(
    (job) =>
      !(
        job.appointmentId === appointmentId &&
        job.followUpSourceId === undefined &&
        job.status === 'pending'
      )
  );
  // worker 的 actionForStatus 對任何非 upsert 狀態一律回 cancel，因此
  // 'deleted' 走的就是 events.delete；刪除不存在的事件（410／404）視為成功。
  state.outboxJobs.push({
    id: `outbox_${appointmentId}_deleted_${Date.now()}`,
    type: 'calendar_projection_requested',
    appointmentId,
    appointmentStatus: 'deleted',
    idempotencyKey: calendarEventIdForAppointment(appointmentId),
    status: 'pending'
  });

  // 個管指派保留紀錄但撤銷：月度工作量不該再算這筆，稽核仍看得到曾指派給誰。
  const now = new Date().toISOString();
  for (const assignment of state.caseAssignments) {
    if (
      assignment.appointmentId === appointmentId &&
      assignment.status === 'active'
    ) {
      assignment.status = 'revoked';
      assignment.revokedAt = now;
      assignment.revokedBy = actorId;
    }
  }

  state.appointments = state.appointments.filter(
    (item) => item.id !== appointmentId
  );
  // 被授權執行時，稽核要看得出「這不是他本來就能做的事」——留下用了哪一組
  // 授權碼（名稱與 id，永不留授權碼本身）。管理者自己動手則沒有這一段。
  appendAudit(state, 'appointment_deleted', appointmentId, actorId, {
    reasonCode,
    previousStatus: appointment.status,
    ...(delegation === undefined
      ? {}
      : {
          delegatedPermission: delegation.permission,
          authorizationId: delegation.authorizationId,
          authorizationLabel: delegation.authorizationLabel
        })
  });
  return appointment;
}

/**
 * 修改預約的備註標籤與自填備註。
 *
 * 備註是櫃台的營運註記（當天到、國外客…），與臨床決定無關，因此**不改變
 * 狀態、不動時段、不產生日曆投影**；但仍寫稽核，因為它會影響現場判斷。
 * 已結束（取消／未到）的預約不再修改：那是已經發生的事實。
 */
export function updateAppointmentNotes(state, appointmentId, input, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) throw new Error('找不到這筆預約。');
  if (
    !['confirmed', 'cancellation_requested', 'completed'].includes(
      appointment.status
    )
  )
    throw new Error('已取消或未到的預約不可再修改備註。');

  appointment.noteTags = selectedTags(
    input?.noteTags,
    BOOKING_NOTE_TAGS,
    '備註'
  );
  appointment.noteText = optionalNote(input?.noteText);
  appointment.updatedAt = new Date().toISOString();
  appendAudit(state, 'appointment_notes_updated', appointmentId, actorId);
  return appointment;
}

export function recordFollowUp(state, appointmentId, input, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined || appointment.status !== 'completed')
    throw new Error('只有已完成到診可登錄醫師回診指示。');

  const status = input?.status;
  if (!['required', 'not_required'].includes(status))
    throw new Error('回診狀態無效。');
  const dueDate = input?.dueDate;
  const dueTime = input?.dueTime;
  if (status === 'required') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? ''))
      throw new Error('需要回診時必須設定目標日期。');
    // 目標日期與時間必須落在可掛號的回診網格上：未營業日、非 :15/:45、
    // 固定不開放時間都在此擋下，與時段產生共用同一套語意。
    const validTimes = followUpDueTimes(state.schedule, dueDate);
    if (validTimes.length === 0)
      throw new Error('目標日期當天未營業，請改選有門診的日期。');
    if (!validTimes.includes(dueTime ?? ''))
      throw new Error('目標時間不在當天的回診可掛號時間內。');
  }

  const tags = selectedTags(input?.tags, FOLLOW_UP_NOTE_TAGS, '回診項目');
  const noteText = optionalNote(input?.noteText);
  const copies = certificateCopies(input?.certificateCopies);

  // 病歷號碼掛在**患者**身上，不是這一筆預約：它是那個人在這家診所的號碼，
  // 回診時是同一個。表單放在回診卡上，因為那是櫃台第一次真的拿到號碼的時機
  // （患者已經到診、病歷已經開出來了）。
  if (input?.medicalRecordNumber !== undefined) {
    const record = state.patients.find(
      (item) => item.id === appointment.patientId
    );
    if (record !== undefined)
      record.medicalRecordNumber = medicalRecordNumber(
        input.medicalRecordNumber
      );
  }

  const now = new Date().toISOString();
  const existing = state.followUps.find(
    (item) => item.appointmentId === appointmentId
  );
  const hadReminder = existing?.status === 'required';
  const next = {
    appointmentId,
    patientId: appointment.patientId,
    status,
    ...(status === 'required' ? { dueDate, dueTime } : {}),
    tags,
    noteText,
    certificateCopies: copies,
    // `followUpDecisionBy` 說明臨床決定來源；操作者只是把醫師指示轉錄進系統。
    // 舊的 decidedBy/decidedAt 暫留相容既有合成資料，UI 與稽核改讀明確欄位。
    followUpDecisionBy: 'doctor_instruction',
    followUpRecordedBy: actorId,
    followUpRecordedAt: now,
    decidedBy: actorId,
    decidedAt: now,
    ...(existing?.scheduledAppointmentId === undefined
      ? {}
      : { scheduledAppointmentId: existing.scheduledAppointmentId })
  };
  if (existing === undefined) state.followUps.push(next);
  else {
    Object.assign(existing, next);
    if (status === 'not_required') {
      delete existing.dueDate;
      delete existing.dueTime;
    }
  }
  appendAudit(state, 'follow_up_decided', appointmentId, actorId);

  // 回診確認後「上日曆」：回診提醒是與原就診分開的另一個事件（見
  // calendarEventIdForFollowUp）。需要回診就 upsert；若原本有提醒而改成
  // 不需要，則用同一 event ID 排入 cancel，不能只刪掉本機工作紀錄。
  if (status === 'required') {
    replaceFollowUpProjection(
      state,
      appointmentId,
      'follow_up_required',
      taipeiIso(dueDate, dueTime)
    );
  } else if (hadReminder)
    replaceFollowUpProjection(state, appointmentId, 'follow_up_not_required');
  return next;
}

// 預約清單依看診時間排序：尚未發生的由近到遠在前，已過去的在後。
export function sortedAppointments(state, now = Date.now()) {
  return [...state.appointments].sort((left, right) => {
    const leftTime = new Date(left.startsAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.startsAt ?? right.createdAt).getTime();
    const leftPast = leftTime < now;
    const rightPast = rightTime < now;
    if (leftPast !== rightPast) return leftPast ? 1 : -1;
    return leftPast ? rightTime - leftTime : leftTime - rightTime;
  });
}
