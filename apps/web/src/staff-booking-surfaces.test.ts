import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hydrateStaff } from '../public/modules/hydrate-staff.js';
import { isInternalTestBookingEnabled } from '../public/modules/api-client.js';

describe('public booking vs staff surfaces', () => {
  it('enables Canonical Booking API on isolated C1 preview without Google login', () => {
    expect(
      isInternalTestBookingEnabled({
        hostname:
          'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app',
        search: ''
      })
    ).toBe(true);
    expect(
      isInternalTestBookingEnabled({
        hostname: 'beauessence-clinic-stg-c1a01.web.app',
        search: '?internalTestBooking=1'
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
    const next = hydrateStaff(
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
    const apiClient = readFileSync(
      fileURLToPath(
        new URL('../public/modules/api-client.js', import.meta.url)
      ),
      'utf8'
    );
    const transport = readFileSync(
      fileURLToPath(
        new URL(
          '../public/modules/internal-test-booking-transport.js',
          import.meta.url
        )
      ),
      'utf8'
    );
    expect(patient).not.toContain('calendar-pilot-entry.js');
    expect(patient).not.toContain('使用 Google 帳號登入');
    expect(loader).toContain("includes('calendarPilot=1')");
    expect(loader).toContain("sessionStorage.getItem('calPilotCsrf')");
    expect(apiClient).toContain('beauessence-clinic-stg-');
    expect(apiClient).toContain("hostname.includes('--')");
    expect(transport).toContain("path === '/booking'");
    expect(transport).toContain("publicBooking ? 'omit' : 'same-origin'");
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
      hydrateStaff(
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
      hydrateStaff(
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
      hydrateStaff(
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
