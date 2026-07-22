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

  // 患者端只標記開始時間：RFC 5545 §3.6.1 規定沒有 DTEND／DURATION 的
  // VEVENT 就落在 DTSTART 那個時間點上。診所端的一小時區塊是另一條路徑。
  it('marks only the start time, with no end or duration', () => {
    expect(ics).toContain('DTSTART:20300102T040000Z');
    expect(ics).not.toContain('DTEND');
    expect(ics).not.toContain('DURATION');
  });

  it('carries a stable UID so re-importing replaces rather than duplicates', () => {
    expect(ics).toContain('UID:appointment_001@beauessence');
    expect(buildIcs(appointment)).toContain('UID:appointment_001@beauessence');
  });

  it('reminds the patient one day ahead', () => {
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-P1D');
  });

  // COLOR 是 RFC 7986 屬性，支援度因用戶端而異（Google 匯入會忽略）。
  // 因此它只當加分，不承載必要資訊——這裡只確認有正確送出。
  it('requests a colour without relying on it', () => {
    expect(ics).toContain('COLOR:green');
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

  // dates 必填且成對，因此起訖同一時間點——Google 會建立零長度事件，
  // 與 .ics 只給 DTSTART 的效果一致。
  it('passes a zero-length window, matching the .ics file', () => {
    expect(url.searchParams.get('dates')).toBe(
      '20300102T040000Z/20300102T040000Z'
    );
  });

  it('carries no patient identifiers in the query string', () => {
    const raw = url.toString();
    for (const secret of ['A123456789', '0912345678', '王測試'])
      expect(raw).not.toContain(encodeURIComponent(secret));
  });
});
