import { describe, expect, it } from 'vitest';

import { renderNextUp } from '../public/modules/admin-view.js';

const HEX_ID = '92bf75e6a1b24c3d8e5f60718293a4b5';

describe('staff next-up card without a patient record', () => {
  it('shows a plain label instead of any id fragment', () => {
    const html = renderNextUp(
      {
        patients: [],
        appointments: [
          {
            id: HEX_ID,
            patientId: '0123456789abcdef0123456789abc_001',
            status: 'confirmed',
            startsAt: '2030-01-01T02:00:00.000+08:00',
            bookingKind: 'initial'
          }
        ]
      },
      Date.parse('2029-12-31T00:00:00.000Z')
    );
    expect(html).toContain('（未留姓名）');
    expect(html).not.toMatch(/[0-9a-f]{32}|term_|_001|409：|末 4 碼/);
  });
});
