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

function seedCompletedAppointment() {
  const state = initialState();
  state.workspace.authenticated = true;
  state.patients.push({
    id: 'patient_test_frozen_boundary',
    name: '合成測試患者'
  });
  state.appointments.push({
    id: 'appointment_test_frozen_boundary',
    patientId: 'patient_test_frozen_boundary',
    status: 'completed'
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

function expectFrozenRejectionWasPreMutation(
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

describe('Phase 1 frozen Case mutation boundary', () => {
  it('rejects /case-assignments before any mutation', async () => {
    const seeded = seedCompletedAppointment();
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/case-assignments', {
        appointmentId: 'appointment_test_frozen_boundary',
        managerId: 'case_manager_test_001'
      })
    ).rejects.toThrow('個案管理功能目前未開放。');

    expectFrozenRejectionWasPreMutation(beforePersisted, beforeState);
  });

  it('rejects follow-up managerId before any mutation', async () => {
    const seeded = seedCompletedAppointment();
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'not_required',
        managerId: 'case_manager_test_001'
      })
    ).rejects.toThrow('個案管理功能目前未開放。');

    expectFrozenRejectionWasPreMutation(beforePersisted, beforeState);
  });

  it('rejects whitespace-only managerId', async () => {
    const seeded = seedCompletedAppointment();
    const beforePersisted = localStorage.getItem(storageKey)!;
    const beforeState = relevantState(seeded);

    await expect(
      post('/follow-ups/appointment_test_frozen_boundary', {
        status: 'not_required',
        managerId: '   '
      })
    ).rejects.toThrow('個案管理功能目前未開放。');

    expectFrozenRejectionWasPreMutation(beforePersisted, beforeState);
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
