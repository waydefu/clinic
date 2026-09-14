import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./internal-test-booking.module.ts', import.meta.url),
  'utf8'
);
const appModule = readFileSync(
  new URL('../app.module.ts', import.meta.url),
  'utf8'
);

describe('InternalTestBookingModule clock wiring', () => {
  it('uses one INTERNAL_TEST_BOOKING_CLOCK for the gate, bookings, and grid', () => {
    expect(source).toMatch(
      /inject:\s*\[\s*APPOINTMENT_AUTHORIZATION,\s*INTERNAL_TEST_BOOKING_CLOCK,\s*'PatientDirectory'\s*\]/s
    );
    expect(source).toMatch(
      /inject:\s*\[\s*SCHEDULE_AUTHORIZATION,\s*INTERNAL_TEST_BOOKING_CLOCK\s*\]/s
    );
    expect(source.match(/new Date\(\)\.toISOString\(\)/g)).toEqual([
      'new Date().toISOString()'
    ]);
  });

  it('keeps the production authenticator on CAL-PILOT sessions', () => {
    expect(source).toMatch(
      /inject:\s*\[\s*CALENDAR_PILOT_SESSIONS,\s*'PatientDirectory',\s*INTERNAL_TEST_BOOKING_CLOCK\s*\]/s
    );
    expect(appModule).toMatch(/InternalTestBookingModule\.register\(\)/);
  });
});
