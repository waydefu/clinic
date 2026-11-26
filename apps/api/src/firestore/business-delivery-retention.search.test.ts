import { describe, expect, it } from 'vitest';

import { FirestoreBusinessRetentionRepository } from './business-delivery-retention.repository.js';

// 工作台找患者：用姓名前綴或電話前綴查 patients，回傳最近一次預約，
// 並且每次都寫一筆稽核紀錄（只記雜湊與長度，不記搜尋字串）。
const NOW = '2030-10-20T00:00:00.000Z';

const PATIENTS = [
  {
    id: 'a8d64d067543ebf6251617049065c51d',
    data: {
      name: '王小明',
      phoneDigits: '0912345678',
      birthMonthDay: '--03-08'
    }
  },
  {
    id: 'b1d64d067543ebf6251617049065c51e',
    data: {
      name: '王美玲',
      phoneDigits: '0987654321',
      birthMonthDay: '--11-02',
      archivedAt: '2030-09-10T00:00:00.000Z'
    }
  },
  {
    id: 'c2d64d067543ebf6251617049065c51f',
    data: {
      name: '陳美玲',
      phoneDigits: '0911222333',
      birthMonthDay: '--01-20'
    }
  }
];

function setup() {
  const logs: Array<{ id: string; data: Record<string, unknown> }> = [];
  const filters: Array<[string, string, string]> = [];
  let max = Infinity;
  const patients = {
    where: (field: string, op: string, value: string) => {
      filters.push([field, op, value]);
      return patients;
    },
    orderBy: () => patients,
    limit: (n: number) => {
      max = n;
      return patients;
    },
    get: () => {
      const docs = PATIENTS.filter((p) =>
        filters.every(([field, op, value]) => {
          const v = String(p.data[field as keyof typeof p.data]);
          return op === '>=' ? v >= value : v <= value;
        })
      )
        .slice(0, max)
        .map((p) => ({ id: p.id, data: () => p.data }));
      return Promise.resolve({ docs });
    }
  };
  const appointments = {
    where: (_f: string, _o: string, patientId: string) => ({
      get: () =>
        Promise.resolve({
          docs:
            patientId === PATIENTS[0]?.id
              ? [
                  {
                    data: {
                      startsAt: '2030-10-01T01:00:00.000Z',
                      status: 'completed'
                    }
                  },
                  {
                    data: {
                      startsAt: '2030-10-25T01:00:00.000Z',
                      status: 'confirmed'
                    }
                  }
                ].map((d) => ({ data: () => d.data }))
              : []
        })
    })
  };
  const db = {
    collection: (name: string) =>
      name === 'patients'
        ? patients
        : name === 'appointments'
          ? appointments
          : {
              doc: (id: string) => ({
                create: (data: Record<string, unknown>) => {
                  logs.push({ id, data });
                  return Promise.resolve();
                }
              })
            }
  };
  return {
    repository: new FirestoreBusinessRetentionRepository(db as never),
    logs,
    filters
  };
}

describe('FirestoreBusinessRetentionRepository.searchPatients', () => {
  it('finds by name prefix and returns display fields and the latest appointment', async () => {
    const { repository } = setup();
    const result = await repository.searchPatients({
      query: '王',
      actorRef: 'actor_ref',
      now: NOW
    });
    expect(result.patients.map((p) => p.label.split('　')[0])).toEqual([
      '王小明',
      '王美玲'
    ]);
    expect(result.patients[0]).toEqual({
      patientId: 'a8d64d067543ebf6251617049065c51d',
      label: '王小明　電話末 3 碼 678　生日 03-08',
      detail: '最近預約：2030-10-25 09:00 已確認'
    });
    expect(result.patients[1]?.detail).toBe('最近預約：無（已封存）');
  });

  it('treats digits as a phone prefix', async () => {
    const { repository, filters } = setup();
    const result = await repository.searchPatients({
      query: '0911-222',
      actorRef: 'actor_ref',
      now: NOW
    });
    expect(filters[0]?.[0]).toBe('phoneDigits');
    expect(result.patients.map((p) => p.label.split('　')[0])).toEqual([
      '陳美玲'
    ]);
  });

  it('writes an audit record without the query text', async () => {
    const { repository, logs } = setup();
    await repository.searchPatients({
      query: '王小明',
      actorRef: 'actor_ref',
      now: NOW
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.data).toMatchObject({
      action: 'patient_search',
      actorRef: 'actor_ref',
      at: NOW,
      queryLength: 3,
      result: { count: 1 }
    });
    expect(JSON.stringify(logs[0]?.data)).not.toContain('王小明');
    expect(String(logs[0]?.data['requestHash'])).toMatch(/^[a-f0-9]{64}$/);
  });

  it('caps the query at 20 rows', async () => {
    const { repository } = setup();
    const result = await repository.searchPatients({
      query: '王',
      actorRef: 'actor_ref',
      now: NOW
    });
    expect(result.patients.length).toBeLessThanOrEqual(20);
  });
});
