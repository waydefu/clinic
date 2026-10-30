import { describe, expect, it } from 'vitest';

import { decideRetentionProjection } from './retention-projection-gate.js';

const EPISODE = '2030-01-01T00:00:00.000Z';
const OTHER_EPISODE = '2031-06-01T00:00:00.000Z';
const appointment = { patientId: 'patient_gate_1', status: 'confirmed' };
const activePatient = { name: 'synthetic' };
const archivedPatient = { archivedAt: EPISODE };
const archiveJob = {
  retentionOperation: 'archive' as const,
  retentionArchivedAt: EPISODE
};
const restoreJob = { retentionOperation: 'restore' as const };

describe('decideRetentionProjection', () => {
  describe('ordinary job', () => {
    it('proceeds for an active patient, even when no patient record is found', () => {
      expect(
        decideRetentionProjection({}, { appointment, patient: activePatient })
      ).toBe('proceed');
      expect(
        decideRetentionProjection({}, { appointment, patient: undefined })
      ).toBe('proceed');
      expect(
        decideRetentionProjection(
          {},
          { appointment: undefined, patient: undefined }
        )
      ).toBe('proceed');
    });

    it('removes the event of an archived patient instead of upserting it', () => {
      expect(
        decideRetentionProjection({}, { appointment, patient: archivedPatient })
      ).toBe('remove');
      expect(
        decideRetentionProjection(
          {},
          {
            appointment: { ...appointment, patientArchived: true },
            patient: undefined
          }
        )
      ).toBe('remove');
    });

    it('trusts the patient record over a leftover appointment flag', () => {
      expect(
        decideRetentionProjection(
          {},
          {
            appointment: { ...appointment, patientArchived: true },
            patient: { archivedAt: null }
          }
        )
      ).toBe('proceed');
    });
  });

  describe('archive job', () => {
    it('removes the event while its own archive episode is current', () => {
      expect(
        decideRetentionProjection(archiveJob, {
          appointment,
          patient: archivedPatient
        })
      ).toBe('remove');
    });

    it('does nothing once the patient was restored', () => {
      expect(
        decideRetentionProjection(archiveJob, {
          appointment,
          patient: activePatient
        })
      ).toBe('skip');
    });

    it('does nothing for an earlier episode after a later archive', () => {
      expect(
        decideRetentionProjection(archiveJob, {
          appointment,
          patient: { archivedAt: OTHER_EPISODE }
        })
      ).toBe('skip');
    });

    it('removes the event when the appointment record itself is gone', () => {
      expect(
        decideRetentionProjection(archiveJob, {
          appointment: undefined,
          patient: undefined
        })
      ).toBe('remove');
    });
  });

  describe('restore job', () => {
    it('re-adds for an active patient', () => {
      expect(
        decideRetentionProjection(restoreJob, {
          appointment,
          patient: activePatient
        })
      ).toBe('proceed');
    });

    it('never resurrects an event after the patient is archived again', () => {
      expect(
        decideRetentionProjection(restoreJob, {
          appointment,
          patient: archivedPatient
        })
      ).toBe('skip');
    });

    it('does nothing when the appointment no longer exists', () => {
      expect(
        decideRetentionProjection(restoreJob, {
          appointment: undefined,
          patient: activePatient
        })
      ).toBe('skip');
    });
  });
});
