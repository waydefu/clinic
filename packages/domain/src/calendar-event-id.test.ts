import { describe, expect, it } from 'vitest';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp,
  fromCalendarEventId,
  isCalendarEventId,
  toCalendarEventId
} from './calendar-event-id.js';
import { DomainError } from './errors.js';

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
};

describe('Calendar event ID', () => {
  it('只產生 Calendar 允許的字元（小寫 a–v 與 0–9）', () => {
    const ids = [
      calendarEventIdForAppointment('appointment_001'),
      calendarEventIdForAppointment('appointment_002')
    ];
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-v]+$/);
      // 這是重點回歸測試：舊格式 calendar_confirmed_appointment_001 含底線，
      // 會被 Calendar API 直接退件。
      expect(id).not.toContain('_');
      expect(isCalendarEventId(id)).toBe(true);
    }
  });

  it('長度落在 5–1024 之間', () => {
    const id = calendarEventIdForAppointment('appointment_001');
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(1024);
  });

  it('同一筆預約永遠得到同一個 ID（冪等的基礎）', () => {
    expect(calendarEventIdForAppointment('appointment_001')).toBe(
      calendarEventIdForAppointment('appointment_001')
    );
  });

  it('不同預約各自不同', () => {
    expect(calendarEventIdForAppointment('appointment_001')).not.toBe(
      calendarEventIdForAppointment('appointment_002')
    );
  });

  it('可解回邏輯鍵，讓人在日曆上看到 ID 時能追查', () => {
    expect(
      fromCalendarEventId(calendarEventIdForAppointment('appointment_001'))
    ).toBe('calendar_appointment_001');
  });

  it('回診提醒與來源就診是不同的事件', () => {
    const visit = calendarEventIdForAppointment('appointment_001');
    const followUp = calendarEventIdForFollowUp('appointment_001');
    expect(followUp).not.toBe(visit);
    expect(isCalendarEventId(followUp)).toBe(true);
    expect(fromCalendarEventId(followUp)).toBe(
      'calendar_followup_appointment_001'
    );
  });

  it('編碼為 RFC 4648 base32hex：對照已知向量', () => {
    // RFC 4648 §10 的測試向量（轉小寫、去掉不合法的 '=' 填充）：
    // "fooba" → "CPNMUOJ1"、"foobar" → "CPNMUOJ1E8======"
    expect(toCalendarEventId('fooba')).toBe('cpnmuoj1');
    expect(toCalendarEventId('foobar')).toBe('cpnmuoj1e8');
    expect(fromCalendarEventId('cpnmuoj1e8')).toBe('foobar');
  });

  it('往返任意 UTF-8 內容不失真', () => {
    for (const value of ['appointment_001', '一森渼診所', 'a/b+c=d'])
      expect(fromCalendarEventId(toCalendarEventId(value))).toBe(value);
  });

  it('拒絕空邏輯鍵與非法 ID', () => {
    expect(codeOf(() => toCalendarEventId(''))).toBe('INVALID_VALUE');
    // RFC 向量 "f" 只會編出 2 個字元，低於 Calendar 的 5 字元下限：
    // 寧可在本機炸掉，也不要等上線後被 API 退件。
    expect(codeOf(() => toCalendarEventId('f'))).toBe('INVALID_VALUE');
    // 'w'–'z' 不在 base32hex 字母表內。
    expect(codeOf(() => fromCalendarEventId('wxyz9'))).toBe('INVALID_VALUE');
    expect(codeOf(() => fromCalendarEventId('AB123'))).toBe('INVALID_VALUE');
    expect(isCalendarEventId('co')).toBe(false);
    expect(isCalendarEventId('calendar_confirmed_appointment_001')).toBe(false);
    expect(isCalendarEventId(42)).toBe(false);
  });
});
