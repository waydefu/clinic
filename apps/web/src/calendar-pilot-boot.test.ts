import { describe, expect, it, vi } from 'vitest';

import {
  firstAuthStateChanged,
  resolveBootUser
} from '../public/modules/pilot-auth-state.js';

function backendWith(overrides = {}) {
  return {
    redirectResult: null,
    onAuthStateChanged: () => () => {},
    currentUser: () => null,
    ...overrides
  };
}

describe('firstAuthStateChanged', () => {
  it('resolves with the first firing and ignores later ones', async () => {
    const listeners: Array<(user: unknown) => void> = [];
    const unsubscribe = vi.fn();
    const pending = firstAuthStateChanged(
      (callback: (user: unknown) => void) => {
        listeners.push(callback);
        return unsubscribe;
      }
    );

    listeners[0]?.('restored_user');
    listeners[0]?.('second_user');

    await expect(pending).resolves.toBe('restored_user');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('normalizes a null firing to null', async () => {
    await expect(
      firstAuthStateChanged((callback: (user: unknown) => void) => {
        callback(null);
        return () => {};
      })
    ).resolves.toBe(null);
  });
});

describe('resolveBootUser', () => {
  it('takes the redirect user without waiting for the state subscription', async () => {
    const onAuthStateChanged = vi.fn(() => () => {});
    const user = await resolveBootUser(
      backendWith({
        redirectResult: { user: 'redirect_user' },
        onAuthStateChanged
      })
    );

    expect(user).toBe('redirect_user');
    expect(onAuthStateChanged).not.toHaveBeenCalled();
  });

  it('waits for the first state firing when there is no redirect user', async () => {
    const order: Array<string> = [];
    const user = await resolveBootUser(
      backendWith({
        redirectResult: null,
        onAuthStateChanged: (callback: (user: unknown) => void) => {
          order.push('subscribe');
          callback('restored_user');
          return () => {};
        },
        currentUser: () => {
          order.push('read');
          return 'restored_user';
        }
      })
    );

    expect(user).toBe('restored_user');
    expect(order).toEqual(['subscribe', 'read']);
  });

  it('returns null when neither redirect nor restored state has a user', async () => {
    const user = await resolveBootUser(
      backendWith({
        onAuthStateChanged: (callback: (user: unknown) => void) => {
          callback(null);
          return () => {};
        }
      })
    );

    expect(user).toBe(null);
  });
});
