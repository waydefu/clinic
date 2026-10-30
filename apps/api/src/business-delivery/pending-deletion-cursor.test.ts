import { describe, expect, it } from 'vitest';

import {
  decodePendingDeletionCursor,
  encodePendingDeletionCursor
} from './pending-deletion-cursor.js';

describe('pending-deletion cursor', () => {
  const POSITION = {
    restorableUntil: '2030-10-31T00:00:00.000Z',
    patientId: 'patient_pd_001'
  };
  const raw = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  it('round-trips a position as URL-safe text', () => {
    const cursor = encodePendingDeletionCursor(POSITION);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePendingDeletionCursor(cursor)).toEqual(POSITION);
  });

  it.each([
    ['not json', Buffer.from('nope').toString('base64url')],
    ['wrong shape', raw({ a: 1 })],
    ['non-UTC time', raw(['2030-10-31', 'patient_pd_001'])],
    ['unsafe id', raw([POSITION.restorableUntil, 'a/b'])],
    ['extra element', raw([POSITION.restorableUntil, 'a', 'b'])],
    ['empty', '']
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodePendingDeletionCursor(cursor)).toThrow(
      expect.objectContaining({ code: 'INVALID_VALUE' })
    );
  });

  it('rejects an alternative encoding of a valid position', () => {
    expect(() =>
      decodePendingDeletionCursor(`${encodePendingDeletionCursor(POSITION)}=`)
    ).toThrow(expect.objectContaining({ code: 'INVALID_VALUE' }));
  });
});
