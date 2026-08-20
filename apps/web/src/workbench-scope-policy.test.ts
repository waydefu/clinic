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
  it('is immutable and fail closed for Case and Payroll', () => {
    expect(Object.isFrozen(WORKBENCH_CAPABILITIES)).toBe(true);
    expect(isWorkbenchCapabilityEnabled('CASE_MANAGEMENT')).toBe(false);
    expect(isWorkbenchCapabilityEnabled('PAYROLL_WORKLOAD')).toBe(false);
    expect(isWorkbenchCapabilityEnabled('UNKNOWN_CAPABILITY')).toBe(false);
  });

  it('removes only the frozen operational task category', () => {
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
      'outboxPending'
    ]);
  });

  it('resolves the frozen deep link to overview as a scope redirect', () => {
    expect(
      resolveScopedWorkbenchPanel('case-section', [
        'overview',
        'appointments-section'
      ])
    ).toEqual({ panelId: 'overview', scopeRedirected: true });
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

  it('keeps Booking tasks while removing pending Case presentation', () => {
    const html = renderTasks(completedState());
    expect(html).toContain('已過時未處理');
    expect(html).toContain('取消待確認');
    expect(html).toContain('回診尚未決定');
    expect(html).toContain('日曆投影待處理');
    expect(html).not.toContain('個管尚未指派');
    expect(html).not.toContain('#case-section');
  });

  it('renders normal follow-up without Case manager affordances', () => {
    const html = renderFollowUps(completedState());
    expect(html).toContain('data-follow-up-form');
    expect(html).toContain('儲存回診指示');
    expect(html).not.toContain('name="managerId"');
    expect(html).not.toContain('個管師');
    expect(html).not.toContain('合成個管師 A');
  });

  it('fails closed for preserved Case/Payroll renderers and intake projection', () => {
    const state = completedState();
    expect(renderCaseAssignments(state)).toBe('');
    expect(renderWorkload(state)).toBe('');
    expect(
      renderIntakeSheet(state, 'appointment_scope_test_001')
    ).not.toContain('管理師');
    expect(
      renderIntakeSheet(state, 'appointment_scope_test_001')
    ).not.toContain('合成個管師 A');
  });
});
