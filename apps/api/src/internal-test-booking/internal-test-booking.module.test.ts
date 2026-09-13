import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./internal-test-booking.module.ts', import.meta.url),
  'utf8'
);

describe('InternalTestBookingModule clock wiring', () => {
  it('uses one INTERNAL_TEST_BOOKING_CLOCK for the gate, bookings, and grid', () => {
    expect(source).toMatch(
      /inject: \[APPOINTMENT_AUTHORIZATION, INTERNAL_TEST_BOOKING_CLOCK\]/
    );
    expect(source).toMatch(
      /inject: \[SCHEDULE_AUTHORIZATION, INTERNAL_TEST_BOOKING_CLOCK\]/
    );
    expect(source.match(/new Date\(\)\.toISOString\(\)/g)).toEqual([
      'new Date().toISOString()'
    ]);
  });
});
