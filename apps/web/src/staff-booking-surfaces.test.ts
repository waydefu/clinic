import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isInternalTestBookingEnabled } from '../public/modules/api-client.js';
import {
  applyServerStaffSessionSnapshot,
  isForbiddenStagingHost,
  isIsolatedC1PreviewHost,
  isPublicBookingPath,
  isStaffWorkbenchPath,
  wantsCalendarPilotOverlay
} from '../public/modules/staff-booking-surfaces.js';

describe('public booking vs staff surfaces', () => {
  it('treats /booking as accountless and never a staff path', () => {
    expect(isPublicBookingPath('/booking')).toBe(true);
    expect(isPublicBookingPath('/patient.html')).toBe(true);
    expect(isStaffWorkbenchPath('/booking')).toBe(false);
    expect(isStaffWorkbenchPath('/staff')).toBe(true);
    expect(wantsCalendarPilotOverlay('')).toBe(false);
    expect(wantsCalendarPilotOverlay('?calendarPilot=1')).toBe(true);
  });

  it('enables Canonical Booking API on isolated C1 preview without Google login', () => {
    expect(
      isIsolatedC1PreviewHost(
        'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
      )
    ).toBe(true);
    expect(
      isIsolatedC1PreviewHost('beauessence-clinic-stg-c1a01.web.app')
    ).toBe(false);
    expect(isForbiddenStagingHost('beauessence-clinic-staging.web.app')).toBe(
      true
    );
    expect(
      isInternalTestBookingEnabled({
        hostname:
          'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app',
        search: ''
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        hostname: '127.0.0.1',
        search: ''
      })
    ).toBe(false);
    expect(
      isInternalTestBookingEnabled({
        hostname: 'beauessence-clinic-staging.web.app',
        search: '?internalTestBooking=1'
      })
    ).toBe(false);
  });

  it('maps a server staff session onto Workbench chrome without public access', () => {
    const storage = {
      getItem(name: string) {
        if (name === 'calPilotCsrf') return 'csrf_test';
        if (name === 'calPilotRole') return 'front_desk';
        return null;
      }
    };
    const next = applyServerStaffSessionSnapshot(
      {
        workspace: {
          authenticated: false,
          currentAccountId: 'admin_test_001',
          accounts: [
            { id: 'admin_test_001', role: 'manager', status: 'active' },
            {
              id: 'front_desk_test_001',
              role: 'front_desk',
              status: 'active'
            }
          ]
        },
        session: { authenticated: false, account: null }
      },
      storage
    );
    expect(next.session.authenticated).toBe(true);
    expect(next.session.account.id).toBe('front_desk_test_001');
    expect(next.workspace.currentAccountId).toBe('front_desk_test_001');
  });

  it('does not load CAL-PILOT on the Booking Page', () => {
    const patient = readFileSync(
      fileURLToPath(new URL('../public/patient.html', import.meta.url)),
      'utf8'
    );
    const loader = readFileSync(
      fileURLToPath(
        new URL('../public/calendar-pilot-entry.js', import.meta.url)
      ),
      'utf8'
    );
    expect(patient).not.toContain('calendar-pilot-entry.js');
    expect(patient).not.toContain('使用 Google 帳號登入');
    expect(loader).toContain('isPublicBookingPath');
    expect(loader).toContain('wantsCalendarPilotOverlay');
    expect(loader).toContain("sessionStorage.getItem('calPilotCsrf')");
    const client = readFileSync(
      fileURLToPath(new URL('./calendar-pilot-entry.js', import.meta.url)),
      'utf8'
    );
    expect(client).toContain('handoffToStaffWorkbench');
    expect(client).toContain('使用 Google 帳號登入');
    expect(client).toContain('CAL-PILOT 合成日曆測試');
  });

  it('does not map a missing CSRF, patient role, or disabled account onto Workbench', () => {
    const workspace = {
      authenticated: false,
      currentAccountId: 'admin_test_001',
      accounts: [
        {
          id: 'front_desk_test_001',
          role: 'front_desk',
          status: 'disabled'
        }
      ]
    };
    const session = { authenticated: false, account: null };
    expect(
      applyServerStaffSessionSnapshot(
        { workspace, session },
        {
          getItem(name: string) {
            if (name === 'calPilotRole') return 'front_desk';
            return null;
          }
        }
      ).session.authenticated
    ).toBe(false);
    expect(
      applyServerStaffSessionSnapshot(
        { workspace, session },
        {
          getItem(name: string) {
            if (name === 'calPilotCsrf') return 'csrf_test';
            if (name === 'calPilotRole') return 'patient';
            return null;
          }
        }
      ).session.authenticated
    ).toBe(false);
    expect(
      applyServerStaffSessionSnapshot(
        { workspace, session },
        {
          getItem(name: string) {
            if (name === 'calPilotCsrf') return 'csrf_test';
            if (name === 'calPilotRole') return 'front_desk';
            return null;
          }
        }
      ).session.authenticated
    ).toBe(false);
  });
});
