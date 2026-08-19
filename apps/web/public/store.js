import {
  createBooking,
  deleteAppointment,
  recordFollowUp,
  rescheduleAppointment,
  requeueOutboxJob,
  simulateCalendarSync,
  sortedAppointments,
  transitionAppointment,
  updateAppointmentNotes
} from './modules/appointment-domain.js';
import {
  assignCaseManager,
  buildOperationalTasks,
  buildWorkload
} from './modules/case-management.js';
import { CASE_MANAGEMENT_ENABLED } from './modules/capability-flags.js';
import { PERMISSIONS } from './modules/constants.js';
import {
  canUseDelegation,
  currentAccount,
  permissionsFor,
  requirePermission,
  requirePermissionOrDelegation
} from './modules/permissions.js';
import {
  cloneSchedule,
  ensureScheduleVersion,
  generateSlots,
  scheduleImpact,
  schedulesEqual,
  validateSchedule
} from './modules/schedule-engine.js';
import {
  initialState,
  loadState,
  resetState,
  saveState,
  storageKey
} from './modules/state-schema.js';
import {
  addRelease,
  authenticateAccount,
  createAccount,
  isMaintenanceActive,
  logout,
  saveAnnouncement,
  saveDelegationAuthorization,
  saveMaintenance,
  toggleAccount,
  toggleDelegation,
  toggleDelegationAuthorization
} from './modules/workspace-domain.js';

export { storageKey };

const PATIENT_ACTOR_ID = 'actor_test_patient_001';

// The synthetic patient page and the staff workbench share this in-browser
// store, so `origin` only records which UI initiated the action. It is declared
// by the caller and therefore proves nothing about who is acting. The real
// service must derive its actor from an authenticated session: do not port this
// branch into apps/api. See ADR-0001.
function resolveActor(state, body, permission) {
  if (body.origin === 'patient') return PATIENT_ACTOR_ID;
  return requirePermission(state, permission).id;
}

function appendWorkspaceAudit(state, action, actorId) {
  state.auditEvents.push({
    id: `audit_workspace_${action}_${Date.now()}`,
    action,
    appointmentId: 'workspace',
    actorId,
    occurredAt: new Date().toISOString()
  });
}

function snapshotState(state) {
  return structuredClone({
    ...state,
    appointments: sortedAppointments(state),
    workload: buildWorkload(state),
    tasks: buildOperationalTasks(state),
    maintenanceActive: isMaintenanceActive(state.workspace.maintenance),
    session: {
      account: currentAccount(state),
      permissions: permissionsFor(state),
      // 這個角色天生沒有、但目前可以憑授權碼取得的權限。介面靠它決定要不要
      // 顯示入口與要不要問授權碼；**它不是授權本身**，真正的把關在
      // requirePermissionOrDelegation，繞過畫面直接送出仍然會被擋。
      delegatable: Object.values(PERMISSIONS).filter((permission) =>
        canUseDelegation(state, permission)
      ),
      authenticated: state.workspace.authenticated === true
    }
  });
}

function workspaceState(state) {
  return structuredClone({
    ...state.workspace,
    maintenanceActive: isMaintenanceActive(state.workspace.maintenance),
    currentAccount: currentAccount(state),
    permissions: permissionsFor(state)
  });
}

function saveDraft(state, schedule) {
  validateSchedule(schedule);
  state.scheduleDraft = cloneSchedule(schedule);
  state.scheduleMeta.draftDirty = !schedulesEqual(
    state.schedule,
    state.scheduleDraft
  );
}

function publishSchedule(state, actorId, expectedVersion) {
  validateSchedule(state.scheduleDraft);
  // 發布者以為自己接在哪一版之後。不符即代表另一個分頁先發布了，擋下而不是
  // 覆蓋——排班是所有可預約時段的來源，靜默覆蓋會讓對方的變更消失無蹤。
  if (expectedVersion !== undefined)
    ensureScheduleVersion(expectedVersion, state.scheduleMeta);
  const candidate = generateSlots(state.scheduleDraft, state.slots);
  const impacted = scheduleImpact(state.appointments, candidate);
  if (impacted.length > 0) {
    throw new Error(
      `營業時間發布會影響 ${impacted.length} 筆尚未結束的合成預約，請先處理預約。`
    );
  }
  state.schedule = cloneSchedule(state.scheduleDraft);
  state.slots = candidate;
  state.scheduleMeta = {
    publishedVersion: state.scheduleMeta.publishedVersion + 1,
    draftDirty: false,
    publishedAt: new Date().toISOString(),
    publishedBy: actorId
  };
  appendWorkspaceAudit(state, 'schedule_published', actorId);
}

function parseBody(options) {
  return options.body === undefined ? {} : JSON.parse(options.body);
}

export async function stagingRequest(path, options = {}) {
  const method = options.method ?? 'GET';
  if (method === 'GET' && path === '/state') return snapshotState(loadState());
  if (method === 'GET' && path === '/workspace')
    return workspaceState(loadState());
  if (method !== 'POST') throw new Error('線上合成預覽只允許 GET 與 POST。');

  const state = loadState();
  const body = parseBody(options);

  if (path === '/reset') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_SYSTEM);
    const fresh = resetState();
    appendWorkspaceAudit(fresh, 'local_state_reset', actor.id);
    saveState(fresh);
    return snapshotState(fresh);
  } else if (path === '/workspace/login') {
    // 登入是進入工作臺的閘門，因此本身不要求權限（尚未有身分）。這是合成
    // 原型、非安全邊界：驗證只比對這台裝置上的明碼帳密。
    const account = authenticateAccount(state, body.username, body.password);
    appendWorkspaceAudit(state, 'session_authenticated', account.id);
  } else if (path === '/workspace/logout') {
    const actor = currentAccount(state);
    logout(state);
    if (actor !== undefined)
      appendWorkspaceAudit(state, 'session_logged_out', actor.id);
  } else if (path === '/workspace/accounts') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_ACCOUNTS);
    createAccount(state, body);
    appendWorkspaceAudit(state, 'account_created', actor.id);
  } else if (/^\/workspace\/accounts\/[A-Za-z0-9_-]+\/toggle$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_ACCOUNTS);
    toggleAccount(state, path.split('/')[3]);
    appendWorkspaceAudit(state, 'account_status_changed', actor.id);
  } else if (path === '/workspace/delegations') {
    // 委派設定屬於帳號與權限管理，因此沿用 MANAGE_ACCOUNTS：能決定誰有帳號的
    // 人，才有資格決定要不要把刪除授權出去。
    const actor = requirePermission(state, PERMISSIONS.MANAGE_ACCOUNTS);
    saveDelegationAuthorization(state, body);
    appendWorkspaceAudit(state, 'delegation_authorization_added', actor.id);
  } else if (/^\/workspace\/delegations\/[A-Za-z0-9_-]+\/toggle$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_ACCOUNTS);
    toggleDelegation(state, path.split('/')[3]);
    appendWorkspaceAudit(state, 'delegation_toggled', actor.id);
  } else if (
    /^\/workspace\/delegations\/[A-Za-z0-9_-]+\/authorizations\/[A-Za-z0-9_-]+\/toggle$/.test(
      path
    )
  ) {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_ACCOUNTS);
    const parts = path.split('/');
    toggleDelegationAuthorization(state, parts[3], parts[5]);
    appendWorkspaceAudit(state, 'delegation_authorization_toggled', actor.id);
  } else if (path === '/workspace/announcement') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_COMMUNICATIONS);
    saveAnnouncement(state, body);
    appendWorkspaceAudit(state, 'announcement_saved', actor.id);
  } else if (path === '/workspace/maintenance') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_COMMUNICATIONS);
    saveMaintenance(state, body);
    appendWorkspaceAudit(state, 'maintenance_saved', actor.id);
  } else if (path === '/workspace/releases') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_COMMUNICATIONS);
    addRelease(state, body);
    appendWorkspaceAudit(state, 'release_recorded', actor.id);
  } else if (path === '/schedule/draft') {
    requirePermission(state, PERMISSIONS.MANAGE_SCHEDULE);
    saveDraft(state, body);
  } else if (path === '/schedule/publish') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_SCHEDULE);
    publishSchedule(state, actor.id, body.expectedVersion);
  } else if (path === '/schedule/discard') {
    requirePermission(state, PERMISSIONS.MANAGE_SCHEDULE);
    state.scheduleDraft = cloneSchedule(state.schedule);
    state.scheduleMeta.draftDirty = false;
  } else if (path === '/bookings') {
    if (
      body.origin === 'patient' &&
      isMaintenanceActive(state.workspace.maintenance)
    )
      throw new Error('預約系統維護中，目前無法送出預約。');
    createBooking(
      state,
      body,
      resolveActor(state, body, PERMISSIONS.CREATE_BOOKING)
    );
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/cancellation$/.test(path)) {
    const actorId = resolveActor(state, body, PERMISSIONS.CANCEL_BOOKING);
    transitionAppointment(
      state,
      path.split('/')[2],
      'request_cancellation',
      actorId
    );
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/cancel$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.CANCEL_BOOKING);
    transitionAppointment(state, path.split('/')[2], 'cancel', actor.id);
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/complete$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.COMPLETE_VISIT);
    transitionAppointment(state, path.split('/')[2], 'complete', actor.id);
    // 到診但忘了帶健保卡（W3）。與一般到診同一個權限、同一個狀態轉換，只多記
    // 一個這一次的事實；獨立的路徑是為了讓稽核分得出兩者。
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/complete-without-card$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.COMPLETE_VISIT);
    transitionAppointment(
      state,
      path.split('/')[2],
      'complete_without_card',
      actor.id
    );
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/no-show$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.COMPLETE_VISIT);
    transitionAppointment(state, path.split('/')[2], 'no_show', actor.id);
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/delete$/.test(path)) {
    // 刪除天生只認管理者；櫃台要走委派並帶授權碼（2026-07-27 負責人方向）。
    // 不接受 origin=patient 的旁路：患者端沒有刪除入口，而 origin 是呼叫端
    // 自稱的，本來就不能當作授權依據（見 resolveActor）。
    const { actor, delegation } = requirePermissionOrDelegation(
      state,
      PERMISSIONS.DELETE_APPOINTMENT,
      body.authorizationSecret
    );
    deleteAppointment(
      state,
      path.split('/')[2],
      body.reasonCode,
      actor.id,
      delegation
    );
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/reschedule$/.test(path)) {
    const actor = requirePermission(state, PERMISSIONS.CREATE_BOOKING);
    rescheduleAppointment(state, path.split('/')[2], body.slotId, actor.id);
  } else if (/^\/bookings\/[A-Za-z0-9_-]+\/notes$/.test(path)) {
    // 備註是櫃台的營運註記，沿用建立預約的權限，不需要管理者。
    const actor = requirePermission(state, PERMISSIONS.CREATE_BOOKING);
    updateAppointmentNotes(state, path.split('/')[2], body, actor.id);
  } else if (/^\/follow-ups\/[A-Za-z0-9_-]+$/.test(path)) {
    // BOOK-MVP-003-B：個管指派是 Phase 1 凍結能力。回診指示本身仍正常，但
    // 「順手」在回診表單裡帶上 managerId 的個管 side effect 必須在寫入前
    // fail closed——在 recordFollowUp 之後才擋會留下「回診成功、個管失敗」的
    // 半完成狀態。因此檢查放在任何 mutation 之前，拒絕時 state 完全不變。
    if (!CASE_MANAGEMENT_ENABLED && typeof body.managerId === 'string' && body.managerId !== '') {
      throw new Error('個管指派功能已凍結，無法在回診指示中指派個管師。');
    }
    const actor = requirePermission(state, PERMISSIONS.MANAGE_FOLLOW_UP);
    const appointmentId = path.split('/')[2];
    recordFollowUp(state, appointmentId, body, actor.id);
    // 回診卡上的個管欄位只是捷徑，仍必須各自通過個管權限——在別的表單裡
    // 順手做，不代表可以繞過該動作的授權。留空表示不變更現有指派。
    if (typeof body.managerId === 'string' && body.managerId !== '') {
      const hasActiveAssignment = state.caseAssignments.some(
        (item) =>
          item.appointmentId === appointmentId && item.status === 'active'
      );
      const caseActor = requirePermission(
        state,
        hasActiveAssignment
          ? PERMISSIONS.REASSIGN_CASE
          : PERMISSIONS.ASSIGN_CASE
      );
      assignCaseManager(state, appointmentId, body.managerId, caseActor.id);
    }
  } else if (path === '/case-assignments') {
    if (!CASE_MANAGEMENT_ENABLED) {
      throw new Error('個管指派功能已凍結，無法指派個管師。');
    }
    const hasActiveAssignment = state.caseAssignments.some(
      (item) =>
        item.appointmentId === body.appointmentId && item.status === 'active'
    );
    const actor = requirePermission(
      state,
      hasActiveAssignment ? PERMISSIONS.REASSIGN_CASE : PERMISSIONS.ASSIGN_CASE
    );
    assignCaseManager(state, body.appointmentId, body.managerId, actor.id);
  } else if (path === '/outbox/simulate') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_COMMUNICATIONS);
    simulateCalendarSync(state, body.fail === true, actor.id);
  } else if (path === '/outbox/requeue') {
    const actor = requirePermission(state, PERMISSIONS.MANAGE_COMMUNICATIONS);
    requeueOutboxJob(state, body.jobId, actor.id);
  } else {
    throw new Error('找不到合成測試動作。');
  }

  saveState(state);
  return snapshotState(state);
}

export { initialState };
