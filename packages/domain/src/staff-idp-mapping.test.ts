import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { ROLES } from './roles.js';
import {
  mapStaffIdpClaims,
  requireMappedStaffIdentity
} from './staff-idp-mapping.js';

describe('mapStaffIdpClaims', () => {
  it('maps a canonical role and opaque subject', () => {
    expect(
      mapStaffIdpClaims({
        subject: 'staff_001',
        role: 'front_desk'
      })
    ).toEqual({ actorId: 'staff_001', actorRole: 'front_desk' });
  });

  it('normalises the legacy admin alias to manager and never emits admin', () => {
    const mapped = mapStaffIdpClaims({
      uid: 'staff_mgr_001',
      role: 'admin'
    });
    expect(mapped).toEqual({
      actorId: 'staff_mgr_001',
      actorRole: 'manager'
    });
    expect(mapped?.actorRole).not.toBe('admin');
    expect(ROLES).toContain(mapped?.actorRole);
  });

  it('fail-closes synthetic browser credentials', () => {
    expect(
      mapStaffIdpClaims({
        subject: 'staff_001',
        role: 'front_desk',
        source: 'synthetic-browser'
      })
    ).toBeUndefined();
    expect(
      mapStaffIdpClaims({
        subject: 'staff_001',
        role: 'front_desk',
        source: 'synthetic-delegated-authorization'
      })
    ).toBeUndefined();
  });

  it('fail-closes unknown, empty, or non-opaque identities', () => {
    expect(mapStaffIdpClaims({ subject: 'staff_001', role: 'superuser' })).toBe(
      undefined
    );
    expect(mapStaffIdpClaims({ role: 'front_desk' })).toBeUndefined();
    expect(
      mapStaffIdpClaims({ subject: 'not a subject', role: 'front_desk' })
    ).toBeUndefined();
    expect(
      mapStaffIdpClaims({
        subject: 'staff_001',
        role: 'service_account'
      })
    ).toBeUndefined();
    expect(
      mapStaffIdpClaims({
        subject: 'staff_001',
        role: 'consultant'
      })
    ).toBeUndefined();
  });

  it('requireMappedStaffIdentity throws instead of inventing a role', () => {
    expect(() =>
      requireMappedStaffIdentity({ subject: 'staff_001', role: 'root' })
    ).toThrow(DomainError);
  });
});
