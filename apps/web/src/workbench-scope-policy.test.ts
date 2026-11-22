import { describe, expect, it } from 'vitest';
import {
  renderCaseAssignments,
  renderFollowUps,
  renderIntakeSheet,
  renderTasks,
  renderWorkload
} from '../public/modules/admin-view.js';
import { PERMISSIONS } from '../public/modules/constants.js';
import { initialState } from '../public/modules/state-schema.js';
import {
  activeOperationalTasks,
  isWorkbenchCapabilityEnabled,
  resolveScopedWorkbenchPanel,
  WORKBENCH_CAPABILITIES
} from '../public/modules/workbench-scope-policy.js';

function completedState() {
  const state: any = initialState();
  state.session = {
    permissions: [
      PERMISSIONS.ASSIGN_CASE,
      PERMISSIONS.REASSIGN_CASE,
      PERMISSIONS.MANAGE_COMMUNICATIONS
    ]
  };
  state.patients.push({
    id: 'patient_scope_test_001',
    name: '合成範圍測試患者',
    phone: '0900000000',
    birthDate: '1990-01-02',
    nationalId: 'A123456789',
    hasNhiCard: true
  });
  state.appointments.push({
    id: 'appointment_scope_test_001',
    patientId: 'patient_scope_test_001',
    status: 'completed',
    startsAt: '2030-01-02T04:00:00.000Z',
    itemLabel: '合成測試項目',
    requestTags: [],
    sourceTags: [],
    patientNote: ''
  });
  state.caseAssignments.push({
    id: 'case_assignment_scope_test_001',
    appointmentId: 'appointment_scope_test_001',
    managerId: 'manager_test_001',
    status: 'active'
  });
  state.workload = [
    {
      managerId: 'manager_test_001',
      payrollPeriod: '2030-01',
      uniquePatientCount: 1,
      visitCount: 1,
      creditCount: 1
    }
  ];
  state.tasks = {
    overdueArrivals: ['appointment_overdue_test_001'],
    cancellationRequests: ['appointment_cancel_test_001'],
    pendingFollowUps: ['appointment_scope_test_001'],
    pendingCaseAssignments: ['appointment_scope_test_001'],
    outboxPending: 1
  };
  return state;
}

describe('Phase 1 workbench scope policy', () => {
  it('enables only owner-scoped Case while Payroll stays fail closed', () => {
    expect(Object.isFrozen(WORKBENCH_CAPABILITIES)).toBe(true);
    expect(isWorkbenchCapabilityEnabled('CASE_MANAGEMENT')).toBe(true);
    expect(isWorkbenchCapabilityEnabled('PAYROLL_WORKLOAD')).toBe(false);
    expect(isWorkbenchCapabilityEnabled('UNKNOWN_CAPABILITY')).toBe(false);
  });

  it('keeps the Case task category while Payroll remains outside the task model', () => {
    const tasks = [
      { key: 'overdueArrivals' },
      { key: 'cancellationRequests' },
      { key: 'pendingFollowUps' },
      { key: 'pendingCaseAssignments' },
      { key: 'outboxPending' }
    ];

    expect(activeOperationalTasks(tasks).map((task) => task.key)).toEqual([
      'overdueArrivals',
      'cancellationRequests',
      'pendingFollowUps',
      'pendingCaseAssignments',
      'outboxPending'
    ]);
  });

  it('resolves the enabled Case deep link without a scope redirect', () => {
    expect(
      resolveScopedWorkbenchPanel('case-section', [
        'overview',
        'appointments-section',
        'case-section'
      ])
    ).toEqual({ panelId: 'case-section', scopeRedirected: false });
    expect(
      resolveScopedWorkbenchPanel('appointments-section', [
        'overview',
        'appointments-section'
      ])
    ).toEqual({
      panelId: 'appointments-section',
      scopeRedirected: false
    });
  });

  it('keeps Booking tasks and restores pending Case presentation', () => {
    const html = renderTasks(completedState());
    expect(html).toContain('已過時未處理');
    expect(html).toContain('取消待確認');
    expect(html).toContain('回診尚未決定');
    expect(html).toContain('日曆投影待處理');
    expect(html).toContain('個管尚未指派');
    expect(html).toContain('#case-section');
  });

  it('renders the permitted Case manager affordance in follow-up', () => {
    const html = renderFollowUps(completedState());
    expect(html).toContain('data-follow-up-form');
    expect(html).toContain('follow-up-decision-card');
    expect(html).toContain('follow-up-context');
    expect(html).toContain('儲存回診指示');
    expect(html).toContain('name="managerId"');
    expect(html).toContain('follow-up-manager');
    expect(html).toContain('follow-up-tags');
    expect(html).toContain('個管師');
    expect(html).toContain('合成個管師 A');
  });

  // C1 伺服器清單不帶病患紀錄：患者欄不能印 32 位雜湊，只留末 4 碼。
  it('shows a readable tail instead of a raw hash when the patient record is absent', () => {
    const state = completedState();
    const patientId = 'e4f891aa00bb11cc22dd33ee44ff5566'.slice(0, 28) + '33ee';
    const appointmentId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    state.patients = [];
    state.appointments[0].id = appointmentId;
    state.appointments[0].patientId = patientId;
    state.tasks.pendingCaseAssignments = [appointmentId];
    const html = renderCaseAssignments(state);
    expect(html).toContain('患者 · 末 4 碼 33ee');
    expect(html).toContain('預約 · 末 4 碼 8f90');
    expect(html).toContain('aria-label="患者 · 末 4 碼 33ee 的個管師"');
    expect(html).not.toContain(`>${patientId}<`);
    expect(html).not.toContain(`>${appointmentId}<`);
  });

  it('restores Case projections while Payroll renderer remains frozen', () => {
    const state = completedState();
    expect(renderCaseAssignments(state)).toContain('data-case-row');
    expect(renderWorkload(state)).toBe('');
    expect(renderIntakeSheet(state, 'appointment_scope_test_001')).toContain(
      '管理師'
    );
    expect(renderIntakeSheet(state, 'appointment_scope_test_001')).toContain(
      '合成個管師 A'
    );
  });
});
