import { describe, expect, it } from 'vitest';

import {
  FirestoreBusinessRetentionRepository,
  type PendingDeletionPosition
} from './business-delivery-retention.repository.js';

// A03 (SOL-RETENTION): the pending-deletion list pages by (restorableUntil,
// patient ID) with a query on the single field `restorableUntil`. This fake
// implements just the query calls the repository makes, in Firestore's order
// (field, then document ID), so the continuation logic is exercised without an
// emulator; the emulator file covers the same cases against Firestore.
const NOW = '2030-10-20T00:00:00.000Z';
const SAME = '2030-10-10T00:00:00.000Z';

interface Row {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

function row(
  id: string,
  restorableUntil: string,
  extra: Record<string, unknown> = {}
): Row {
  return {
    id,
    data: {
      archivedAt: '2030-09-10T00:00:00.000Z',
      restorableUntil,
      name: '合成患者',
      ...extra
    }
  };
}

function repositoryOver(rows: Row[]) {
  const order = (left: Row, right: Row) =>
    String(left.data['restorableUntil']).localeCompare(
      String(right.data['restorableUntil'])
    ) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const sorted = [...rows].sort(order);
  const reads: number[] = [];
  const query = (state: {
    lte?: string;
    gte?: string;
    after?: Row | undefined;
    max?: number;
  }): unknown => ({
    where: (_field: string, operator: string, value: string) =>
      query(
        operator === '<=' ? { ...state, lte: value } : { ...state, gte: value }
      ),
    orderBy: () => query(state),
    startAfter: (document: { id: string }) =>
      query({ ...state, after: rows.find((item) => item.id === document.id) }),
    limit: (max: number) => query({ ...state, max }),
    get: () => {
      const list = sorted
        .filter((item) => {
          const at = String(item.data['restorableUntil']);
          return (
            (state.lte === undefined || at <= state.lte) &&
            (state.gte === undefined || at >= state.gte) &&
            (state.after === undefined || order(item, state.after) > 0)
          );
        })
        .slice(0, state.max ?? Infinity)
        .map((item) => ({ id: item.id, data: () => item.data }));
      reads.push(list.length);
      return Promise.resolve({ docs: list, size: list.length });
    }
  });
  const db = { collection: () => query({}) };
  return {
    repository: new FirestoreBusinessRetentionRepository(db as never),
    reads
  };
}

async function pageThrough(
  repository: FirestoreBusinessRetentionRepository,
  limit: number
) {
  const pages: string[][] = [];
  let after: PendingDeletionPosition | undefined;
  for (let guard = 0; guard < 20; guard += 1) {
    const page = await repository.pendingDeletion(NOW, {
      limit,
      ...(after === undefined ? {} : { after })
    });
    pages.push(page.patients.map((patient) => patient.patientId));
    if (page.next === undefined) break;
    after = page.next;
  }
  return pages;
}

describe('pending-deletion paging', () => {
  it('pages records that share one time without omissions or repeats', async () => {
    const { repository } = repositoryOver([
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
        row(`patient_${id}`, SAME, id === 'd' ? { legalHold: true } : {})
      ),
      row('patient_h', '2030-10-15T00:00:00.000Z'),
      row('patient_future', '2030-12-01T00:00:00.000Z'),
      { id: 'patient_active', data: { name: '合成患者乙' } }
    ]);

    expect(await pageThrough(repository, 2)).toEqual([
      ['patient_a', 'patient_b'],
      ['patient_c', 'patient_d'],
      ['patient_e', 'patient_f'],
      ['patient_g', 'patient_h']
    ]);
    expect(await pageThrough(repository, 3)).toEqual([
      ['patient_a', 'patient_b', 'patient_c'],
      ['patient_d', 'patient_e', 'patient_f'],
      ['patient_g', 'patient_h']
    ]);
  });

  it('keeps the hold flag, reads no name and gives no continuation for a full last page', async () => {
    const { repository } = repositoryOver([
      row('patient_a', SAME),
      row('patient_b', SAME, { legalHold: true })
    ]);

    const page = await repository.pendingDeletion(NOW, { limit: 2 });

    expect(page.next).toBeUndefined();
    expect(page.patients.map((patient) => patient.legalHold)).toEqual([
      false,
      true
    ]);
    expect(JSON.stringify(page)).not.toContain('合成患者');
  });

  it('reports a position exactly when one more record follows', async () => {
    const { repository } = repositoryOver([
      row('patient_a', SAME),
      row('patient_b', SAME),
      row('patient_c', SAME)
    ]);

    const page = await repository.pendingDeletion(NOW, { limit: 2 });

    expect(page.patients).toHaveLength(2);
    expect(page.next).toEqual({
      restorableUntil: SAME,
      patientId: 'patient_b'
    });
  });

  it('is bounded: a default page never reads more than the page size plus one per query', async () => {
    const many = Array.from({ length: 250 }, (_, index) =>
      row(`patient_${String(index).padStart(3, '0')}`, SAME)
    );
    const { repository, reads } = repositoryOver(many);

    const page = await repository.pendingDeletion(NOW);

    expect(page.patients).toHaveLength(100);
    expect(page.next).toBeDefined();
    expect(Math.max(...reads)).toBeLessThanOrEqual(101);
  });
});
