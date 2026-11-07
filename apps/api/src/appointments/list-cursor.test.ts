import { describe, expect, it } from 'vitest';

import { decodeListCursor, encodeListCursor } from './list-cursor.js';

describe('appointment list cursor', () => {
  const POSITION = {
    startsAt: '2026-07-24T04:00:00.000Z',
    appointmentId: 'appointment_cursor_001'
  };
  const raw = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  it('round-trips a position as URL-safe text', () => {
    const cursor = encodeListCursor(POSITION);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeListCursor(cursor)).toEqual(POSITION);
  });

  it.each([
    ['not json', Buffer.from('nope').toString('base64url')],
    ['wrong shape', raw({ a: 1 })],
    ['non-UTC time', raw(['2026-07-24', 'appointment_cursor_001'])],
    ['unsafe id', raw([POSITION.startsAt, 'a/b'])],
    ['extra element', raw([POSITION.startsAt, 'a', 'b'])],
    ['empty', '']
  ])('rejects %s', (_label, cursor) => {
    expect(() => decodeListCursor(cursor)).toThrow(
      expect.objectContaining({ code: 'INVALID_VALUE' })
    );
  });

  it('rejects an alternative encoding of a valid position', () => {
    expect(() => decodeListCursor(`${encodeListCursor(POSITION)}=`)).toThrow(
      expect.objectContaining({ code: 'INVALID_VALUE' })
    );
  });
});
