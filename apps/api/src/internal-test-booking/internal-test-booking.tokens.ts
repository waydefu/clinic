import { randomBytes } from 'node:crypto';

export const INTERNAL_TEST_BOOKING_SETTINGS = 'InternalTestBookingSettings';
export const INTERNAL_TEST_BOOKING_CLOCK = 'InternalTestBookingClock';

export interface InternalTestBookingClock {
  nowUtc(): string;
}

export function opaqueBookingId(): string {
  return randomBytes(16).toString('hex');
}
