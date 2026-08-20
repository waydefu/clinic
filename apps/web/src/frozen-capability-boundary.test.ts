import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mutationSpies = vi.hoisted(() => ({
  assignCaseManager: vi.fn(),
  loadState: vi.fn(),
  recordFollowUp: vi.fn(),
  saveState: vi.fn()
}));

vi.mock('../public/modules/appointment-domain.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  mutationSpies.recordFollowUp.mockImplementation(actual.recordFollowUp);
  return { ...actual, recordFollowUp: mutationSpies.recordFollowUp };
});

vi.mock('../public/modules/case-management.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  mutationSpies.assignCaseManager.mockImplementation(actual.assignCaseManager);
  return { ...actual, assignCaseManager: mutationSpies.assignCaseManager };
});

vi.mock('../public/modules/state-schema.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  mutationSpies.loadState.mockImplementation(actual.loadState);
  mutationSpies.saveState.mockImplementation(actual.saveState);
  return {
    ...actual,
    loadState: mutationSpies.loadState,
    saveState: mutationSpies.saveState
  };
});

import { initialState, stagingRequest, storageKey } from '../public/store.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function seedCompletedAppointment({
  accountId = 'admin_test_001',
  activeManagerId
}: {
  accountId?: string;
  activeManagerId?: string;
} = {}) {
  const state = initialState();
  state.workspace.authenticated = true;
  state.workspace.currentAccountId = accountId;
  state.patients.push({
    id: 'patient_test_frozen_boundary',
    name: '合成測試患者'
  });
  state.appointments.push({
    id: 'appointment_test_frozen_boundary',
    patientId: 'patient_test_frozen_boundary',
    status: 'completed',
    completedAt: '2030-01-01T04:00:00.000Z',
    updatedAt: '2030-01-01T04:00:00.000Z'
  });
  if (activeManagerId !== undefined)
    state.caseAssignments.push({
      id: 'case_assignment_test_boundary',
      appointmentId: 'appointment_test_frozen_boundary',
      patientId: 'patient_test_frozen_boundary',
      managerId: activeManagerId,
      status: 'active',
      assignedAt: '2030-01-01T00:00:00.000Z',
      assignedBy: 'admin_test_001',
      ruleVersion: 'synthetic-v1'
    });
  localStorage.setItem(storageKey, JSON.stringify(state));
  return state;
}

function relevantState(state: ReturnType<typeof initialState>) {
  return structuredClone({
    appointments: state.appointments,
    patients: state.patients,
    followUps: state.followUps,
    caseAssignments: state.caseAssignments,
    auditEvents: state.auditEvents,
    outboxJobs: state.outboxJobs
  });
}

function post(path: string, body: Record<string, unknown>) {
  return stagingRequest(path, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function loadedRequestState() {
  return mutationSpies.loadState.mock.results[0]?.value as ReturnType<
    typeof initialState
  >;
}

function expectRejectionWasPreMutation(
  beforePersisted: string,
  beforeState: ReturnType<typeof relevantState>
) {
  expect(mutationSpies.recordFollowUp).not.toHaveBeenCalled();
  expect(mutationSpies.assignCaseManager).not.toHaveBeenCalled();
  expect(mutationSpies.saveState).not.toHaveBeenCalled();
  expect(relevantState(loadedRequestState())).toEqual(beforeState);
  expect(localStorage.getItem(storageKey)).toBe(beforePersisted);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  mutationSpies.assignCaseManager.mockClear();
  mutationSpies.loadState.mockClear();
  mutationSpies.recordFollowUp.mockClear();
  mutationSpies.saveState.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Owner-scoped synthetic Case mutation boundary', () => {
  it('allows front desk initial /case-assignments and saves once', async () => {
    seedCompletedAppointment({ accountId: 'front_desk_test_001' });

    await expect(
      post('/case-assignments', {
        appointmentId: 'appointment_test_frozen_boundary',
        managerId: 'manager_test_001'
      })
    ).resolves.toBeDefined();

    const persisted = JSON.parse(localStorage.getItem(storageKey)!);
    expect(mutationSpies.recordFollowUp).not.toHaveBeenCalled();
    expect(mutationSpies.assignCaseManager).toHaveBeenCalledOnce();
    expect(mutationSpies.saveState).toHaveBeenCalledOnce();
    expect(persisted.caseAssignments).toHaveLength(1);
    expect(persisted.caseAssignments[0].managerId).toBe('manager_test_001');
    expect(persisted.auditEvents.at(-1)?.action).toBe('case_manager_assigned');
  });

  it('rejects front desk reassignment before any mutation', async () => {
    const seeded = seedCompletedAppointment({
      accountId: 'front_desk_test_001',
      activeManagerId: 'manager_test_001'
    });
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/case-assignments', {
        appointmentId: 'appointment_test_frozen_boundary',
        managerId: 'manager_test_002'
      })
    ).rejects.toThrow('目前合成帳號沒有執行此動作的權限。');

    expectRejectionWasPreMutation(beforePersisted, beforeState);
  });

  it('allows admin reassignment with the preserved audit vocabulary', async () => {
    seedCompletedAppointment({ activeManagerId: 'manager_test_001' });

    await expect(
      post('/case-assignments', {
        appointmentId: 'appointment_test_frozen_boundary',
        managerId: 'manager_test_002'
      })
    ).resolves.toBeDefined();

    const persisted = JSON.parse(localStorage.getItem(storageKey)!);
    expect(mutationSpies.assignCaseManager).toHaveBeenCalledOnce();
    expect(mutationSpies.saveState).toHaveBeenCalledOnce();
    expect(persisted.caseAssignments).toHaveLength(1);
    expect(persisted.caseAssignments[0].managerId).toBe('manager_test_002');
    expect(persisted.auditEvents.at(-1)?.action).toBe(
      'case_manager_reassigned'
    );
  });

  it('rejects follow-up reassignment before recordFollowUp when Case permission fails', async () => {
    const seeded = seedCompletedAppointment({
      accountId: 'front_desk_test_001',
      activeManagerId: 'manager_test_001'
    });
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'not_required',
        managerId: 'manager_test_002'
      })
    ).rejects.toThrow('目前合成帳號沒有執行此動作的權限。');

    expectRejectionWasPreMutation(beforePersisted, beforeState);
  });

  it('records follow-up then Case assignment and saves once after authorization', async () => {
    const seeded = seedCompletedAppointment({
      accountId: 'front_desk_test_001'
    });

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15',
        tags: [],
        noteText: '',
        certificateCopies: 0,
        managerId: 'manager_test_001'
      })
    ).resolves.toBeDefined();

    const persisted = JSON.parse(localStorage.getItem(storageKey)!);
    expect(mutationSpies.recordFollowUp).toHaveBeenCalledOnce();
    expect(mutationSpies.assignCaseManager).toHaveBeenCalledOnce();
    expect(mutationSpies.saveState).toHaveBeenCalledOnce();
    expect(
      mutationSpies.recordFollowUp.mock.invocationCallOrder[0]
    ).toBeLessThan(mutationSpies.assignCaseManager.mock.invocationCallOrder[0]);
    expect(
      mutationSpies.assignCaseManager.mock.invocationCallOrder[0]
    ).toBeLessThan(mutationSpies.saveState.mock.invocationCallOrder[0]);
    expect(persisted.followUps).toHaveLength(1);
    expect(persisted.caseAssignments).toHaveLength(1);
    expect(persisted.auditEvents).toHaveLength(seeded.auditEvents.length + 2);
    expect(persisted.outboxJobs).toHaveLength(seeded.outboxJobs.length + 1);
  });

  it('rejects whitespace-only managerId before any mutation', async () => {
    const seeded = seedCompletedAppointment();
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'not_required',
        managerId: '   '
      })
    ).rejects.toThrow('個管師不可只填空白。');

    expectRejectionWasPreMutation(beforePersisted, beforeState);
  });

  it.each([
    ['absent', {}],
    ['undefined (serialized as absent)', { managerId: undefined }],
    ['empty', { managerId: '' }]
  ])('allows follow-up when managerId is %s', async (_, extra) => {
    const seeded = seedCompletedAppointment();
    const beforeAuditCount = seeded.auditEvents.length;
    const beforeOutboxCount = seeded.outboxJobs.length;

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15',
        tags: [],
        noteText: '',
        certificateCopies: 0,
        ...extra
      })
    ).resolves.toBeDefined();

    const persisted = JSON.parse(localStorage.getItem(storageKey)!);
    expect(mutationSpies.recordFollowUp).toHaveBeenCalledOnce();
    expect(mutationSpies.assignCaseManager).not.toHaveBeenCalled();
    expect(mutationSpies.saveState).toHaveBeenCalledOnce();
    expect(persisted.followUps).toHaveLength(1);
    expect(persisted.caseAssignments).toEqual([]);
    expect(persisted.auditEvents).toHaveLength(beforeAuditCount + 1);
    expect(persisted.outboxJobs).toHaveLength(beforeOutboxCount + 1);
  });
});
