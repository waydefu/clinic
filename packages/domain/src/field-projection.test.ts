import { describe, expect, it } from 'vitest';

import {
  isBlockedProjectionField,
  projectRecordFields
} from './field-projection.js';

const record = {
  appointmentId: 'appt_001',
  slotId: 'slot_001',
  status: 'confirmed',
  settlementAmount: 1000,
  consultantCommission: 50,
  clinicalNotes: 'opaque-clinical',
  anesthesia: 'opaque-anesthesia'
};

describe('projectRecordFields', () => {
  it('omits money and clinical keys instead of returning null', () => {
    const projected = projectRecordFields('manager', record);
    expect(projected).toEqual({
      appointmentId: 'appt_001',
      slotId: 'slot_001',
      status: 'confirmed'
    });
    expect(projected).not.toHaveProperty('settlementAmount');
    expect(projected).not.toHaveProperty('clinicalNotes');
    expect(JSON.stringify(projected)).not.toContain('1000');
  });

  it('fail-closes an unknown or missing role', () => {
    expect(projectRecordFields(undefined, record)).toEqual({});
    expect(projectRecordFields('admin' as never, record)).toEqual({});
  });

  it('does not grant physician clinical fields while D-014 is pending', () => {
    expect(projectRecordFields('physician', record)).toEqual({
      appointmentId: 'appt_001',
      slotId: 'slot_001',
      status: 'confirmed'
    });
  });

  it('names the blocked columns so callers can omit them at query time', () => {
    expect(isBlockedProjectionField('settlementAmount')).toBe(true);
    expect(isBlockedProjectionField('slotId')).toBe(false);
  });
});
