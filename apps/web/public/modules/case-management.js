import { TIME_ZONE } from './constants.js';

function payrollPeriod(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function assignCaseManager(state, appointmentId, managerId, actorId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined || appointment.status !== 'completed')
    throw new Error('只有已完成到診的合成預約可指派個管師。');
  const manager = state.caseManagers.find(
    (item) => item.id === managerId && item.status === 'active'
  );
  if (manager === undefined) throw new Error('找不到可用的合成個管師。');
  const now = new Date().toISOString();
  const existing = state.caseAssignments.find(
    (item) => item.appointmentId === appointmentId && item.status === 'active'
  );
  if (existing === undefined)
    state.caseAssignments.push({
      id: `case_assignment_${appointmentId}`,
      appointmentId,
      patientId: appointment.patientId,
      managerId,
      status: 'active',
      assignedAt: now,
      assignedBy: actorId,
      ruleVersion: 'synthetic-v1'
    });
  else {
    // 權限層會把首次指派與改派分開；domain helper 仍負責維持單一 active
    // assignment，避免任何呼叫端自行改陣列。
    existing.managerId = managerId;
    existing.assignedAt = now;
    existing.assignedBy = actorId;
  }
  state.auditEvents.push({
    id: `audit_${appointmentId}_case_${Date.now()}`,
    action:
      existing === undefined
        ? 'case_manager_assigned'
        : 'case_manager_reassigned',
    appointmentId,
    actorId,
    occurredAt: now
  });
}

export function buildWorkload(state) {
  const groups = new Map();
  for (const assignment of state.caseAssignments.filter(
    (item) => item.status === 'active'
  )) {
    const appointment = state.appointments.find(
      (item) =>
        item.id === assignment.appointmentId && item.status === 'completed'
    );
    if (appointment === undefined) continue;
    const period = payrollPeriod(
      appointment.completedAt ?? appointment.updatedAt
    );
    const key = `${assignment.managerId}:${period}`;
    const group = groups.get(key) ?? {
      managerId: assignment.managerId,
      payrollPeriod: period,
      patientIds: new Set(),
      visitCount: 0,
      ruleVersion: assignment.ruleVersion
    };
    group.patientIds.add(appointment.patientId);
    group.visitCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    managerId: group.managerId,
    payrollPeriod: group.payrollPeriod,
    creditCount: group.patientIds.size,
    uniquePatientCount: group.patientIds.size,
    visitCount: group.visitCount,
    ruleBreakdown: [
      {
        metricCode: 'completed_unique_patient',
        ruleVersion: group.ruleVersion,
        creditCount: group.patientIds.size,
        uniquePatientCount: group.patientIds.size
      }
    ]
  }));
}

export function buildOperationalTasks(state) {
  const assigned = new Set(
    state.caseAssignments
      .filter((item) => item.status === 'active')
      .map((item) => item.appointmentId)
  );
  const decided = new Set(state.followUps.map((item) => item.appointmentId));
  return {
    pendingCaseAssignments: state.appointments
      .filter((item) => item.status === 'completed' && !assigned.has(item.id))
      .map((item) => item.id),
    pendingFollowUps: state.appointments
      .filter((item) => item.status === 'completed' && !decided.has(item.id))
      .map((item) => item.id),
    cancellationRequests: state.appointments
      .filter((item) => item.status === 'cancellation_requested')
      .map((item) => item.id),
    outboxPending: state.outboxJobs.filter((item) => item.status === 'pending')
      .length
  };
}
