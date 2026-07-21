import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildIcs,
  buildSummary
} from '../public/modules/calendar-export.js';

const appointment = {
  id: 'appointment_001',
  startsAt: '2030-01-02T04:00:00.000Z',
  kindLabel: '初診'
};

describe('buildIcs', () => {
  const ics = buildIcs(appointment);

  it('uses CRLF line endings as RFC 5545 requires', () => {
    expect(ics).toContain('\r\n');
    expect(
      ics.split('\r\n').filter((line) => line.includes('\n'))
    ).toHaveLength(0);
  });

  it('is a single well-formed event', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect([...ics.matchAll(/BEGIN:VEVENT/g)]).toHaveLength(1);
    expect([...ics.matchAll(/END:VEVENT/g)]).toHaveLength(1);
  });

  it('derives a 30-minute end from the start', () => {
    expect(ics).toContain('DTSTART:20300102T040000Z');
    expect(ics).toContain('DTEND:20300102T043000Z');
  });

  it('carries a stable UID so re-importing replaces rather than duplicates', () => {
    expect(ics).toContain('UID:appointment_001@beauessence');
    expect(buildIcs(appointment)).toContain('UID:appointment_001@beauessence');
  });

  it('sets a reminder before the appointment', () => {
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT2H');
  });

  // 許多人的行事曆與家人共用，因此匯出內容與日曆投影適用同一套最小化原則。
  it('contains no patient identifiers', () => {
    for (const secret of [
      '王測試',
      'A123456789',
      '0912345678',
      '鼻中膈彎曲',
      '止鼾'
    ])
      expect(ics).not.toContain(secret);
  });

  it('escapes characters that would otherwise break the format', () => {
    const risky = buildIcs({
      ...appointment,
      kindLabel: '初診; 加號, 反斜線\\'
    });
    expect(risky).toContain('\\;');
    expect(risky).toContain('\\,');
    expect(risky).toContain('\\\\');
    // 跳脫後每個屬性仍應各自成行。
    expect(
      risky.split('\r\n').filter((line) => line.startsWith('SUMMARY:'))
    ).toHaveLength(1);
  });
});

describe('buildSummary', () => {
  it('names the clinic and the visit type only', () => {
    expect(buildSummary(appointment)).toBe('一森渼診所 初診');
  });
});

describe('buildGoogleCalendarUrl', () => {
  const url = new URL(buildGoogleCalendarUrl(appointment));

  it('targets the Google Calendar template action', () => {
    expect(url.origin + url.pathname).toBe(
      'https://calendar.google.com/calendar/render'
    );
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
  });

  it('passes the same window as the .ics file', () => {
    expect(url.searchParams.get('dates')).toBe(
      '20300102T040000Z/20300102T043000Z'
    );
  });

  it('carries no patient identifiers in the query string', () => {
    const raw = url.toString();
    for (const secret of ['A123456789', '0912345678', '王測試'])
      expect(raw).not.toContain(encodeURIComponent(secret));
  });
});
