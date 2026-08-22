import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  activeBookingsFor,
  createBooking,
  deleteAppointment,
  recordFollowUp,
  rescheduleAppointment,
  sortedAppointments,
  transitionAppointment
} from '../public/modules/appointment-domain.js';
import {
  assignCaseManager,
  buildOperationalTasks,
  buildWorkload,
  overdueAppointments
} from '../public/modules/case-management.js';
import { PERMISSIONS } from '../public/modules/constants.js';
import {
  appointmentPage,
  DEFAULT_APPOINTMENT_PAGE_SIZE,
  renderAppointments,
  renderIntakeSheet
} from '../public/modules/admin-view.js';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp
} from '../public/vendor/domain/index.js';
import {
  followUpDueTimes,
  generateSlots,
  isUpcomingSlot,
  scheduleImpact
} from '../public/modules/schedule-engine.js';
import { initialState, isUsableState } from '../public/modules/state-schema.js';
import {
  layoutCalendarEvents,
  renderWeekView
} from '../public/modules/week-view.js';
import { createAccount } from '../public/modules/workspace-domain.js';
import {
  cancelPatientAppointment,
  lookupPatientAppointments,
  patientCancellationEligibility
} from '../public/modules/patient-booking-management.js';

// 合成資料的可預約視窗自 2026-07-27 起由**今天**起算（P5，業主要求）。
//
// 這份測試裡有二十幾個 `slot_20300102_*`、`2030-01-02` 之類的字串。把它們逐一
// 改寫成「今天 + n 天」的計算式，會讓每一行都失去它現在帶著的資訊——讀的人
// 一眼就知道 01-02 是週三、01-06 是週日，換成算式之後那些都要重新推導。
//
// 所以改成把時鐘凍住。凍在 2030-01-01（週二，診所休診），視窗的第一個門診日
// 因此是 01-02 週三——與先前寫死 `SYNTHETIC_WINDOW_START = '2030-01-01'` 的
// 結果完全相同，那些日期於是重新變成確定的值，而且仍然是「相對於今天」算出來的。
//
// 「視窗真的跟著今天走」由本檔最後那一組測試以兩個不同的時鐘各驗一次。
const FROZEN_NOW = new Date('2030-01-01T00:00:00+08:00');
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

const PATIENT_A = {
  name: '測試患者甲',
  phone: '0912345678',
  birthDate: '1990-05-20',
  nationalId: 'A123456789',
  hasNhiCard: true
};
const PATIENT_B = {
  name: '測試患者乙',
  phone: '0922333444',
  birthDate: '1985-11-02',
  nationalId: 'B287654321',
  hasNhiCard: false
};

describe('合成狀態的隱私證據邊界', () => {
  it('不保存不存在的正式政策版本或接受紀錄', () => {
    const state = initialState();
    expect(state).not.toHaveProperty('policyVersion');
    expect(JSON.stringify(state)).not.toMatch(
      /privacy-v\d|policyAcceptance|consent/i
    );
  });

  it('拒絕同版本卻夾帶舊政策版本欄位的瀏覽器狀態', () => {
    expect(
      isUsableState({
        ...initialState(),
        policyVersion: 'privacy-v1'
      })
    ).toBe(false);
  });
});

describe('週曆事件排版', () => {
  const event = (id: string, startsAt: string) => ({ id, startsAt });

  it('沒有時間重疊時每筆事件使用完整欄寬', () => {
    const result = layoutCalendarEvents([
      event('appointment_001', '2030-01-02T04:00:00.000Z'),
      event('appointment_002', '2030-01-02T04:30:00.000Z')
    ]);

    expect(result.map(({ lane, laneCount }: any) => [lane, laneCount])).toEqual(
      [
        [0, 1],
        [0, 1]
      ]
    );
  });

  it('初診與回診時間交疊時才分成兩條視覺軌道', () => {
    const result = layoutCalendarEvents([
      event('appointment_001', '2030-01-02T04:00:00.000Z'),
      event('appointment_002', '2030-01-02T04:15:00.000Z')
    ]);

    expect(result.map(({ lane, laneCount }: any) => [lane, laneCount])).toEqual(
      [
        [0, 2],
        [1, 2]
      ]
    );
  });

  it('連鎖重疊群組維持穩定欄數，群組結束後恢復整欄', () => {
    const result = layoutCalendarEvents([
      event('appointment_001', '2030-01-02T04:00:00.000Z'),
      event('appointment_002', '2030-01-02T04:15:00.000Z'),
      event('appointment_003', '2030-01-02T04:30:00.000Z'),
      event('appointment_004', '2030-01-02T05:00:00.000Z')
    ]);

    expect(result.map(({ lane, laneCount }: any) => [lane, laneCount])).toEqual(
      [
        [0, 2],
        [1, 2],
        [0, 2],
        [0, 1]
      ]
    );
  });

  it('桌機以七個日期欄呈現，營業時間只在表頭且空 cell 不製造事件占位', () => {
    const html = renderWeekView(initialState(), '2029-12-31', '2029-12-31');

    expect(html).toContain('class="wv-date-table"');
    expect(html.match(/class="wv-date-head/g)).toHaveLength(7);
    expect(html).toContain('10:00–18:00');
    expect(html).toContain('12:00–20:00');
    expect(html).toContain('休診');
    expect(html).not.toContain('data-week-session');
    expect(html).not.toContain('data-week-event');
    expect(html).not.toContain('尚無預約');
    expect(html).not.toContain('data-top');
    expect(html).not.toContain('wv-axis');
  });

  it('排班外仍存在的預約保留在原日期欄，不因排班改版消失', () => {
    const state: any = initialState();
    state.patients.push({ id: 'patient_outside', name: '排班外患者' });
    state.appointments.push({
      id: 'appointment_outside',
      patientId: 'patient_outside',
      startsAt: '2029-12-31T04:00:00.000Z',
      bookingKind: 'initial',
      itemIds: ['service_snoring'],
      itemLabel: '睡眠呼吸中止症',
      status: 'confirmed'
    });

    const html = renderWeekView(state, '2029-12-31', '2029-12-31');
    expect(html).toContain('data-week-event="appointment_outside"');
  });
});

describe('病人查詢與自助取消', () => {
  const verification = {
    mode: 'phone',
    phone: PATIENT_A.phone,
    birthDate: PATIENT_A.birthDate
  };
  const bookedState = () => {
    const state: any = initialState();
    const appointment = createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'patient_test_001'
    );
    return { state, appointment };
  };

  it('電話＋生日與證件＋生日都可查到，同一欄位或錯誤身分一律回通用失敗', () => {
    const { state, appointment } = bookedState();
    expect(lookupPatientAppointments(state, verification)).toEqual([
      appointment
    ]);
    expect(
      lookupPatientAppointments(state, {
        mode: 'document',
        documentNumber: PATIENT_A.nationalId.toLowerCase(),
        birthDate: PATIENT_A.birthDate
      })
    ).toEqual([appointment]);
    for (const bad of [
      { mode: 'phone', phone: PATIENT_A.phone },
      { mode: 'phone', birthDate: PATIENT_A.birthDate },
      { ...verification, phone: '0900000000' },
      { ...verification, birthDate: '1990-05-21' }
    ])
      expect(() => lookupPatientAppointments(state, bad)).toThrow(
        '查無符合的可管理預約。'
      );
  });

  it.each([
    [21, true, 'allowed'],
    [20, false, 'phone_required'],
    [19, false, 'phone_required'],
    [-1, false, 'phone_required']
  ])('距離 %i 分鐘時 allowed=%s', (minutes, allowed, code) => {
    const now = Date.parse('2030-01-02T03:00:00.000Z');
    expect(
      patientCancellationEligibility(
        { status: 'confirmed', startsAt: new Date(now + minutes * 60_000) },
        now
      )
    ).toMatchObject({ allowed, code });
  });

  it('成功直接進 canonical cancelled、釋放時段、各新增一次 audit/outbox', () => {
    const { state, appointment } = bookedState();
    const slot = state.slots.find(
      (item: any) => item.id === appointment.slotId
    );
    const before = {
      audit: state.auditEvents.length,
      outbox: state.outboxJobs.length
    };

    cancelPatientAppointment(
      state,
      appointment.id,
      verification,
      'actor_test_patient_001',
      Date.parse(appointment.startsAt) - 21 * 60_000
    );

    expect(appointment.status).toBe('cancelled');
    expect(slot.reservationId).toBeUndefined();
    expect(state.auditEvents).toHaveLength(before.audit + 1);
    expect(state.auditEvents.at(-1).action).toBe('appointment_cancelled');
    expect(state.outboxJobs).toHaveLength(before.outbox + 1);
    expect(state.outboxJobs.at(-1).appointmentStatus).toBe('cancelled');
  });

  it('20 分鐘、錯誤身分與已取消重試都在 mutation 前拒絕', () => {
    const deniedCases = [
      (state: any, appointment: any) =>
        cancelPatientAppointment(
          state,
          appointment.id,
          verification,
          'actor_test_patient_001',
          Date.parse(appointment.startsAt) - 20 * 60_000
        ),
      (state: any, appointment: any) =>
        cancelPatientAppointment(
          state,
          appointment.id,
          { ...verification, phone: '0900000000' },
          'actor_test_patient_001',
          Date.parse(appointment.startsAt) - 21 * 60_000
        )
    ];
    for (const deny of deniedCases) {
      const { state, appointment } = bookedState();
      const before = JSON.stringify(state);
      expect(() => deny(state, appointment)).toThrow();
      expect(JSON.stringify(state)).toBe(before);
    }

    const { state, appointment } = bookedState();
    const now = Date.parse(appointment.startsAt) - 21 * 60_000;
    cancelPatientAppointment(
      state,
      appointment.id,
      verification,
      'actor_test_patient_001',
      now
    );
    const afterFirst = JSON.stringify(state);
    expect(() =>
      cancelPatientAppointment(
        state,
        appointment.id,
        verification,
        'actor_test_patient_001',
        now
      )
    ).toThrow('這筆預約已取消。');
    expect(JSON.stringify(state)).toBe(afterFirst);
  });
});

const localClock = (slot: { startsAt: string }) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei'
  }).format(new Date(slot.startsAt));

const onDate = (state: any, date: string) =>
  state.slots.filter((slot: { id: string }) =>
    slot.id.startsWith(`slot_${date}_`)
  );

const openSlot = (state: any, kind: string) =>
  state.slots.find(
    (item: any) => item.kind === kind && item.reservationId === undefined
  );

describe('門診時段', () => {
  it('週日、週一、週二不開放', () => {
    const state = initialState();
    // 2030-01-06 週日、2030-01-07 週一、2030-01-08 週二
    expect(onDate(state, '20300106')).toHaveLength(0);
    expect(onDate(state, '20300107')).toHaveLength(0);
    expect(onDate(state, '20300108')).toHaveLength(0);
  });

  // 收診時間以**官網公告**為準：週三～週五 12:00–20:00（2026-07-27 負責人確認，
  // 先前程式排到 20:30）。門診窗是「最後一格必須在收診前結束」，所以最後一格
  // 初診 19:30、回診 19:15——不是 20:00 開始再看到 20:30。
  it('週三 12:00–20:00 產生初診 13 格、回診 12 格', () => {
    const state = initialState();
    const wednesday = onDate(state, '20300102');
    const initial = wednesday.filter((slot: any) => slot.kind === 'initial');
    const followUp = wednesday.filter((slot: any) => slot.kind === 'follow_up');

    // 初診 12:00 起每 30 分一格到 19:30 共 16 格，扣掉 13:00／15:00／17:00 三個
    // 醫師固定行程 = 13；回診 12:15 起到 19:15 共 15 格，扣掉三個 = 12。
    expect(initial).toHaveLength(13);
    expect(followUp).toHaveLength(12);
    expect(localClock(initial[0])).toBe('12:00');
    expect(localClock(initial.at(-1))).toBe('19:30');
    expect(localClock(followUp[0])).toBe('12:15');
    expect(localClock(followUp.at(-1))).toBe('19:15');
  });

  it('週六 10:00–18:00 產生初診 13 格、回診 12 格', () => {
    const state = initialState();
    const saturday = onDate(state, '20300105');
    expect(
      saturday.filter((slot: any) => slot.kind === 'initial')
    ).toHaveLength(13);
    expect(
      saturday.filter((slot: any) => slot.kind === 'follow_up')
    ).toHaveLength(12);
  });

  it('初診只落在整點與 30 分，回診只落在 15 分與 45 分', () => {
    const state = initialState();
    for (const slot of state.slots) {
      const minute = Number(localClock(slot).slice(3));
      if (slot.kind === 'initial') expect([0, 30]).toContain(minute);
      else expect([15, 45]).toContain(minute);
    }
  });

  it('排除固定不開放時間', () => {
    const state = initialState();
    const wednesday = onDate(state, '20300102').map(localClock);
    for (const blocked of [
      '13:00',
      '15:00',
      '17:00',
      '13:15',
      '15:15',
      '17:15'
    ])
      expect(wednesday).not.toContain(blocked);
  });

  it('回診目標時間依日期產生：營業日給 :15/:45 網格、未營業日為空', () => {
    const state = initialState();
    // 2030-01-02 週三 12:00–20:00：第一格 12:15、跳過固定不開放的 13:15。
    const wednesday = followUpDueTimes(state.schedule, '2030-01-02');
    expect(wednesday[0]).toBe('12:15');
    expect(wednesday).not.toContain('13:15');
    expect(wednesday).toContain('12:45');
    // 週日未營業與格式錯誤都回空陣列。
    expect(followUpDueTimes(state.schedule, '2030-01-06')).toEqual([]);
    expect(followUpDueTimes(state.schedule, 'not-a-date')).toEqual([]);
    // 休診例外日也不可選。
    const closed = {
      ...state.schedule,
      dateExceptions: [{ date: '2030-01-02', kind: 'closed', intervals: [] }]
    };
    expect(followUpDueTimes(closed, '2030-01-02')).toEqual([]);
  });

  it('可自訂固定不開放時間', () => {
    const state = initialState();
    const schedule = {
      ...state.schedule,
      blockedTimes: { initial: ['12:00'], follow_up: [] }
    };
    const times = generateSlots(schedule).map(localClock);
    expect(times).not.toContain('12:00');
    expect(times).toContain('13:00');
    expect(times).toContain('13:15');
  });

  it('偵測會影響既有預約的排班變更', () => {
    const state = initialState();
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'admin_test_001'
    );
    const empty = { ...state.schedule, weeklyAvailability: [] };
    expect(
      scheduleImpact(state.appointments, generateSlots(empty))
    ).toHaveLength(1);
  });
});

describe('帳號治理', () => {
  it('拒絕重複的帳號標籤（標籤是清單上辨識帳號的唯一依據）', () => {
    const state = initialState();
    createAccount(state, { label: '測試櫃台 B', role: 'front_desk' });
    expect(() =>
      createAccount(state, { label: '測試櫃台 B', role: 'front_desk' })
    ).toThrowError(/已有名稱/);
    expect(() =>
      createAccount(state, { label: ' 測試櫃台 B ', role: 'admin' })
    ).toThrowError(/已有名稱/);
    expect(
      state.workspace.accounts.filter((item) => item.label === '測試櫃台 B')
    ).toHaveLength(1);
  });
});

describe('預約建立', () => {
  it('記錄患者資料、項目與備註標籤', () => {
    const state = initialState();
    const appointment = createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['procedure_septum'],
        noteTags: ['same_day', 'overseas'],
        noteText: '需要輪椅'
      },
      'front_desk_test_001'
    );

    expect(appointment.itemLabel).toBe('鼻中膈彎曲');
    expect(appointment.noteTags).toEqual(['same_day', 'overseas']);
    expect(appointment.noteText).toBe('需要輪椅');
    expect(state.patients).toHaveLength(1);
    expect(state.patients[0].hasNhiCard).toBe(true);
  });

  it('掛號別必須與時段格對應', () => {
    const state = initialState();
    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'follow_up').id,
          patient: PATIENT_A,
          itemIds: ['service_snoring'],
          bookingKind: 'initial'
        },
        'admin_test_001'
      )
    ).toThrow(/整點或 30 分/);
  });

  it('拒絕格式不正確的患者資料', () => {
    const state = initialState();
    const slotId = openSlot(state, 'initial').id;
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ name: '' }, /姓名/],
      [{ phone: 'abc' }, /電話/],
      // 2026-07-27 起生日的年份選填，訊息因此改談「出生月份與日期」——
      // 三格的表單裡「生日格式不正確」不會告訴使用者是哪一格出了問題。
      [{ birthDate: '90-05-20' }, /出生月份與日期/],
      [{ birthDate: '--02-31' }, /有效的日期/],
      [{ nationalId: 'X999' }, /身分證/],
      [{ nationalId: '', passportNumber: 'A1' }, /護照號碼/],
      // 兩種證件都空：訊息要同時指出兩條路，否則外籍患者只會被叫去填身分證。
      [{ nationalId: '' }, /外籍人士/]
    ];
    for (const [patch, message] of cases) {
      expect(() =>
        createBooking(
          state,
          {
            slotId,
            patient: { ...PATIENT_A, ...patch },
            itemIds: ['service_snoring']
          },
          'admin_test_001'
        )
      ).toThrow(message);
    }
  });

  it('同一人同時只能有一筆未完成預約', () => {
    const state = initialState();
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'admin_test_001'
    );

    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: PATIENT_A,
          itemIds: ['service_snoring']
        },
        'admin_test_001'
      )
    ).toThrow(/未完成的預約/);

    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: PATIENT_B,
          itemIds: ['service_aesthetic']
        },
        'admin_test_001'
      )
    ).not.toThrow();
  });

  it('完成到診後同一人可再次預約', () => {
    const state = initialState();
    const appointment = createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'admin_test_001'
    );
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );

    expect(activeBookingsFor(state, PATIENT_A)).toHaveLength(0);
    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: PATIENT_A,
          itemIds: ['service_snoring']
        },
        'admin_test_001'
      )
    ).not.toThrow();
  });
});

describe('櫃台處置', () => {
  const book = (state: any, patient = PATIENT_A) =>
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient,
        itemIds: ['service_snoring']
      },
      'front_desk_test_001'
    );

  it('未到會釋出時段並保留紀錄', () => {
    const state = initialState();
    const appointment = book(state);
    const slotId = appointment.slotId;

    transitionAppointment(
      state,
      appointment.id,
      'no_show',
      'front_desk_test_001'
    );

    expect(state.appointments[0].status).toBe('no_show');
    expect(
      state.slots.find((item: any) => item.id === slotId).reservationId
    ).toBeUndefined();
  });

  it('改期會釋出原時段並占用新時段', () => {
    const state = initialState();
    const appointment = book(state);
    const original = appointment.slotId;
    const target = openSlot(state, 'initial');

    rescheduleAppointment(
      state,
      appointment.id,
      target.id,
      'front_desk_test_001'
    );

    expect(
      state.slots.find((item: any) => item.id === original).reservationId
    ).toBeUndefined();
    expect(
      state.slots.find((item: any) => item.id === target.id).reservationId
    ).toBe(appointment.id);
    expect(state.appointments[0].startsAt).toBe(target.startsAt);
  });

  it('改期不可跨掛號別', () => {
    const state = initialState();
    const appointment = book(state);
    const followUpSlot = openSlot(state, 'follow_up');
    expect(() =>
      rescheduleAppointment(
        state,
        appointment.id,
        followUpSlot.id,
        'admin_test_001'
      )
    ).toThrow(/掛號別不符/);
  });

  it('回診確認可記錄項目、備註與診斷書份數', () => {
    const state = initialState();
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );

    const decision = recordFollowUp(
      state,
      appointment.id,
      {
        status: 'required',
        dueDate: '2030-02-01',
        dueTime: '12:15',
        tags: ['nose_follow_up', 'half_year_repair'],
        noteText: '追蹤鼻塞',
        certificateCopies: 2
      },
      'admin_test_001'
    );

    expect(decision.tags).toEqual(['nose_follow_up', 'half_year_repair']);
    expect(decision.certificateCopies).toBe(2);
    expect(decision.dueTime).toBe('12:15');
  });

  it('同日已過去的時段不可預約（5 點不能約 4 點）', () => {
    const at = (iso: string) => ({ id: 's', kind: 'initial', startsAt: iso });
    const now = Date.parse('2030-01-02T09:00:00.000Z');
    expect(isUpcomingSlot(at('2030-01-02T08:00:00.000Z'), now)).toBe(false);
    expect(isUpcomingSlot(at('2030-01-02T10:00:00.000Z'), now)).toBe(true);
  });

  it('確認需要回診會產生回診的日曆投影（上日曆），改成不需要則移除', () => {
    const state: any = initialState();
    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.MANAGE_FOLLOW_UP]
    };
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );

    recordFollowUp(
      state,
      appointment.id,
      { status: 'required', dueDate: '2030-02-01', dueTime: '12:15', tags: [] },
      'admin_test_001'
    );
    const followUpJobs = state.outboxJobs.filter(
      (job: any) => job.appointmentStatus === 'follow_up_required'
    );
    expect(followUpJobs).toHaveLength(1);
    // 回診提醒是與原就診分開的事件：鑰匙必須不同。
    const visitKey = calendarEventIdForAppointment(appointment.id);
    expect(followUpJobs[0].idempotencyKey).not.toBe(visitKey);
    expect(followUpJobs[0].idempotencyKey).toBe(
      calendarEventIdForFollowUp(appointment.id)
    );
    // 目標時間換算成 Asia/Taipei 12:15 = 04:15Z。
    expect(followUpJobs[0].startsAt).toBe('2030-02-01T04:15:00.000Z');
    const calendar = renderWeekView(state, '2030-01-28', '2030-01-28');
    expect(calendar).toContain(`data-week-event="${appointment.id}"`);
    expect(calendar).toContain('wv-follow-up');
    expect(calendar).toContain('回診提醒');
    expect(calendar).toContain('待安排回診');

    // 已完成到診＋需要回診 → 櫃台處理清單顯示「待安排回診」的回診版卡片。
    const queued = renderAppointments(state, {
      status: 'all',
      kind: 'all',
      query: ''
    });
    expect(queued).toContain('待安排回診');
    expect(queued).toContain(appointment.id);

    // 改成「目前無需回診」後，那筆回診投影應被移除，且不再出現在櫃台清單。
    recordFollowUp(
      state,
      appointment.id,
      { status: 'not_required', tags: [] },
      'admin_test_001'
    );
    expect(
      state.outboxJobs.filter(
        (job: any) => job.appointmentStatus === 'follow_up_required'
      )
    ).toHaveLength(0);
    expect(
      state.outboxJobs.filter(
        (job: any) => job.appointmentStatus === 'follow_up_not_required'
      )
    ).toHaveLength(1);
    expect(renderWeekView(state, '2030-01-28', '2030-01-28')).not.toContain(
      `data-week-event="${appointment.id}"`
    );

    // 2026-07-25 行為變更：改成「目前無需回診」之後，**回診**要消失，但那筆
    // 已完成的看診紀錄要留著。
    //
    // 先前這裡整筆從清單移除（理由是「後續無動作」），代價是一次真實發生過的
    // 看診從畫面上徹底消失——連切到「全部狀態」都找不回來，管理者也就再也無法
    // 刪除誤建的紀錄。日常畫面不受影響：預設的「當日」「待處理」篩選本來就不
    // 列出已完成的預約。
    const afterCancel = renderAppointments(state, {
      status: 'all',
      kind: 'all',
      query: ''
    });
    expect(afterCancel).toContain(appointment.id);
    expect(afterCancel).toContain('已完成到診');
    expect(afterCancel).not.toContain('待安排回診');
  });

  it('回診正式掛號後以新預約取代提醒，完成後仍可再安排下一次回診', () => {
    const state: any = initialState();
    const initialVisit = book(state);
    transitionAppointment(
      state,
      initialVisit.id,
      'complete',
      'front_desk_test_001'
    );
    recordFollowUp(
      state,
      initialVisit.id,
      { status: 'required', dueDate: '2030-01-02', dueTime: '12:15', tags: [] },
      'admin_test_001'
    );

    const followUpVisit = createBooking(
      state,
      {
        slotId: openSlot(state, 'follow_up').id,
        patient: PATIENT_A,
        bookingKind: 'follow_up',
        itemIds: ['service_snoring'],
        origin: 'patient'
      },
      'patient_test_001'
    );

    expect(
      state.followUps.find(
        (item: any) => item.appointmentId === initialVisit.id
      )?.scheduledAppointmentId
    ).toBe(followUpVisit.id);
    const bookedCalendar = renderWeekView(state, '2029-12-31', '2029-12-31');
    expect(bookedCalendar).not.toContain(
      `data-week-event="${initialVisit.id}"`
    );
    expect(bookedCalendar).toContain(`data-week-event="${followUpVisit.id}"`);
    expect(
      state.outboxJobs.find(
        (job: any) =>
          job.followUpSourceId === initialVisit.id &&
          job.appointmentStatus === 'follow_up_scheduled'
      )
    ).toBeDefined();

    transitionAppointment(
      state,
      followUpVisit.id,
      'complete',
      'front_desk_test_001'
    );
    recordFollowUp(
      state,
      followUpVisit.id,
      { status: 'required', dueDate: '2030-01-09', dueTime: '12:15', tags: [] },
      'admin_test_001'
    );

    const nextCalendar = renderWeekView(state, '2030-01-07', '2030-01-07');
    expect(nextCalendar).toContain(`data-week-event="${followUpVisit.id}"`);
    expect(nextCalendar).toContain('待安排回診');
  });

  it('缺 session 時回診版卡片不拋錯、且隱藏「調整回診」', () => {
    const state: any = initialState();
    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.MANAGE_FOLLOW_UP]
    };
    const appointment = book(state);
    transitionAppointment(state, appointment.id, 'complete', 'front_desk_001');
    recordFollowUp(
      state,
      appointment.id,
      { status: 'required', dueDate: '2030-02-01', dueTime: '12:15', tags: [] },
      'admin_001'
    );
    // 模擬登入前／測試夾具：拿掉 session 後渲染不得整個拋錯。
    state.session = undefined;
    let html = '';
    expect(() => {
      html = renderAppointments(state, {
        status: 'all',
        kind: 'all',
        query: ''
      });
    }).not.toThrow();
    expect(html).toContain('待安排回診');
    // 沒有權限（無 session）時不出現調整回診的入口。
    expect(html).not.toContain('data-follow-up-edit');
  });

  it('回診目標日期未營業或時間不在回診網格時拒絕', () => {
    const state = initialState();
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );
    const record = (dueDate: string, dueTime: string) =>
      recordFollowUp(
        state,
        appointment.id,
        { status: 'required', dueDate, dueTime, tags: [] },
        'admin_test_001'
      );

    // 2030-02-03 週日、02-04 週一未營業；13:15 是固定不開放；12:00 非 :15/:45。
    expect(() => record('2030-02-03', '12:15')).toThrow(/未營業/);
    expect(() => record('2030-02-04', '12:15')).toThrow(/未營業/);
    expect(() => record('2030-02-01', '13:15')).toThrow(/回診可掛號時間/);
    expect(() => record('2030-02-01', '12:00')).toThrow(/回診可掛號時間/);
    expect(record('2030-02-01', '12:45').dueTime).toBe('12:45');
  });

  it('拒絕未定義的回診項目與超量診斷書', () => {
    const state = initialState();
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );

    expect(() =>
      recordFollowUp(
        state,
        appointment.id,
        { status: 'not_required', tags: ['bogus'] },
        'a'
      )
    ).toThrow(/未定義/);
    expect(() =>
      recordFollowUp(
        state,
        appointment.id,
        { status: 'not_required', certificateCopies: 99 },
        'a'
      )
    ).toThrow(/份數/);
  });
});

describe('刪除預約紀錄', () => {
  const book = (state: any, patient = PATIENT_A) =>
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient,
        itemIds: ['service_snoring']
      },
      'front_desk_test_001'
    );

  it('移出清單、釋出時段，並在稽核留下理由與刪除前狀態', () => {
    const state: any = initialState();
    const appointment = book(state);

    deleteAppointment(
      state,
      appointment.id,
      'duplicate_record',
      'admin_test_001'
    );

    expect(state.appointments).toHaveLength(0);
    expect(
      state.slots.find((item: any) => item.id === appointment.slotId)
        .reservationId
    ).toBeUndefined();
    const event = state.auditEvents.at(-1);
    expect(event).toMatchObject({
      action: 'appointment_deleted',
      appointmentId: appointment.id,
      actorId: 'admin_test_001',
      reasonCode: 'duplicate_record',
      previousStatus: 'confirmed'
    });
  });

  // 取消是「這筆預約不會發生」的事實，刪除是「這筆紀錄不該存在」。已取消的
  // 預約早就把時段還出去了，刪除不得再動那一格——否則會擠掉後來訂走的人。
  it('刪除已取消的紀錄不會搶走已被別人訂走的同一格', () => {
    const state: any = initialState();
    const first = book(state);
    const slotId = first.slotId;
    transitionAppointment(state, first.id, 'cancel', 'front_desk_test_001');
    const second = createBooking(
      state,
      { slotId, patient: PATIENT_B, itemIds: ['service_snoring'] },
      'front_desk_test_001'
    );

    deleteAppointment(state, first.id, 'created_in_error', 'admin_test_001');

    expect(
      state.slots.find((item: any) => item.id === slotId).reservationId
    ).toBe(second.id);
  });

  it('拒絕未知的刪除理由與不存在的預約', () => {
    const state: any = initialState();
    const appointment = book(state);
    expect(() =>
      deleteAppointment(state, appointment.id, 'because', 'admin_test_001')
    ).toThrow(/刪除理由/);
    expect(() =>
      deleteAppointment(state, appointment.id, undefined, 'admin_test_001')
    ).toThrow(/刪除理由/);
    expect(() =>
      deleteAppointment(state, 'appointment_404', 'wrong_patient', 'admin')
    ).toThrow(/找不到/);
    expect(state.appointments).toHaveLength(1);
  });

  // 刪掉正式回診門診不等於病患不必回診，否則整個回診就此人間蒸發。
  it('刪除回診門診會把來源回診放回待安排並讓提醒回到日曆', () => {
    const state: any = initialState();
    const initialVisit = book(state);
    transitionAppointment(
      state,
      initialVisit.id,
      'complete',
      'front_desk_test_001'
    );
    recordFollowUp(
      state,
      initialVisit.id,
      { status: 'required', dueDate: '2030-01-02', dueTime: '12:15', tags: [] },
      'admin_test_001'
    );
    const followUpVisit = createBooking(
      state,
      {
        slotId: openSlot(state, 'follow_up').id,
        patient: PATIENT_A,
        bookingKind: 'follow_up',
        itemIds: ['service_snoring'],
        origin: 'patient'
      },
      'patient_test_001'
    );

    deleteAppointment(
      state,
      followUpVisit.id,
      'created_in_error',
      'admin_test_001'
    );

    const source = state.followUps.find(
      (item: any) => item.appointmentId === initialVisit.id
    );
    expect(source.scheduledAppointmentId).toBeUndefined();
    const reminders = state.outboxJobs.filter(
      (job: any) => job.followUpSourceId === initialVisit.id
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      appointmentStatus: 'follow_up_required',
      startsAt: '2030-01-02T04:15:00.000Z'
    });
  });

  it('刪除已決定回診的就診會一併收掉那筆回診提醒', () => {
    const state: any = initialState();
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );
    recordFollowUp(
      state,
      appointment.id,
      { status: 'required', dueDate: '2030-02-01', dueTime: '12:15', tags: [] },
      'admin_test_001'
    );

    deleteAppointment(state, appointment.id, 'wrong_patient', 'admin_test_001');

    expect(state.followUps).toHaveLength(0);
    const reminders = state.outboxJobs.filter(
      (job: any) => job.followUpSourceId === appointment.id
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0].appointmentStatus).toBe('follow_up_not_required');
  });

  // 尚未送出的投影意圖若留著，刪除後那些工作會把事件又建回日曆。
  it('撤掉待送的投影並排入刪除事件，保留已完成的歷史', () => {
    const state: any = initialState();
    const appointment = book(state);
    state.outboxJobs[0].status = 'completed';
    rescheduleAppointment(
      state,
      appointment.id,
      openSlot(state, 'initial').id,
      'front_desk_test_001'
    );

    deleteAppointment(
      state,
      appointment.id,
      'duplicate_record',
      'admin_test_001'
    );

    const own = state.outboxJobs.filter(
      (job: any) => job.appointmentId === appointment.id
    );
    expect(own.filter((job: any) => job.status === 'pending')).toHaveLength(1);
    expect(own.at(-1)).toMatchObject({
      appointmentStatus: 'deleted',
      status: 'pending',
      idempotencyKey: calendarEventIdForAppointment(appointment.id)
    });
    expect(own.filter((job: any) => job.status === 'completed')).toHaveLength(
      1
    );
  });

  it('撤銷個管指派，月度工作量不再計入', () => {
    const state: any = initialState();
    const appointment = book(state);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );
    assignCaseManager(
      state,
      appointment.id,
      'manager_test_001',
      'admin_test_001'
    );
    expect(buildWorkload(state)).toHaveLength(1);

    deleteAppointment(state, appointment.id, 'wrong_patient', 'admin_test_001');

    expect(buildWorkload(state)).toHaveLength(0);
    expect(state.caseAssignments[0]).toMatchObject({
      status: 'revoked',
      revokedBy: 'admin_test_001'
    });
  });

  it('只有具刪除權限者看得到刪除入口', () => {
    const state: any = initialState();
    book(state);
    const filters = { status: 'all', kind: 'all', query: '' };

    state.session = {
      account: state.workspace.accounts[1],
      permissions: [PERMISSIONS.CREATE_BOOKING, PERMISSIONS.CANCEL_BOOKING]
    };
    expect(renderAppointments(state, filters)).not.toContain(
      'data-appointment-action="delete"'
    );

    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.DELETE_APPOINTMENT]
    };
    expect(renderAppointments(state, filters)).toContain(
      'data-appointment-action="delete"'
    );
  });
});

describe('預約清單排序', () => {
  it('未發生的由近到遠在前，已過去的排在後面', () => {
    const state = initialState();
    const slots = state.slots.filter((item: any) => item.kind === 'initial');
    createBooking(
      state,
      { slotId: slots[4].id, patient: PATIENT_A, itemIds: ['service_snoring'] },
      'admin_test_001'
    );
    createBooking(
      state,
      { slotId: slots[1].id, patient: PATIENT_B, itemIds: ['service_snoring'] },
      'admin_test_001'
    );

    const ordered = sortedAppointments(
      state,
      Date.parse('2029-12-31T00:00:00Z')
    );
    expect(ordered[0].slotId).toBe(slots[1].id);
    expect(ordered[1].slotId).toBe(slots[4].id);

    const afterwards = sortedAppointments(
      state,
      Date.parse('2031-01-01T00:00:00Z')
    );
    expect(afterwards[0].slotId).toBe(slots[4].id);
  });
});

describe('櫃台預約清單介面', () => {
  const filters = {
    status: 'active',
    kind: 'all',
    patientId: 'all',
    query: ''
  };

  it('成立中的預約直接顯示高頻到診按鈕，更多選單不放停用項目', () => {
    const state: any = initialState();
    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.MANAGE_FOLLOW_UP]
    };
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'front_desk_test_001'
    );

    const html = renderAppointments(state, filters);

    expect(html).toContain('appointment-arrival-button');
    expect(html).toContain('data-appointment-action="complete"');
    expect(html).toContain('更多處置');
    expect(html).not.toContain('disabled');
  });

  it('完成到診後只有具回診權限者看得到記錄回診捷徑', () => {
    const state: any = initialState();
    const appointment = createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'front_desk_test_001'
    );
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );
    const completedFilters = { ...filters, status: 'all' };

    state.session = {
      account: state.workspace.accounts[1],
      permissions: []
    };
    expect(renderAppointments(state, completedFilters)).not.toContain(
      'data-appointment-action="follow_up_confirm"'
    );

    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.MANAGE_FOLLOW_UP]
    };
    expect(renderAppointments(state, completedFilters)).toContain(
      'data-appointment-action="follow_up_confirm"'
    );
  });

  it('可用患者姓名與電話快速搜尋', () => {
    const state: any = initialState();
    state.session = {
      account: state.workspace.accounts[0],
      permissions: [PERMISSIONS.MANAGE_FOLLOW_UP]
    };
    createBooking(
      state,
      {
        slotId: openSlot(state, 'initial').id,
        patient: PATIENT_A,
        itemIds: ['service_snoring']
      },
      'front_desk_test_001'
    );

    expect(
      renderAppointments(state, { ...filters, query: '091234' })
    ).toContain('測試患者甲');
    expect(
      renderAppointments(state, { ...filters, query: '不存在' })
    ).toContain('沒有符合條件的預約');
  });

  it('每頁固定顯示 20 筆，保留總結果與目標預約所在位置', () => {
    const state: any = initialState();
    state.patients = [
      {
        id: 'patient_pagination',
        ...PATIENT_A
      }
    ];
    state.appointments = Array.from({ length: 25 }, (_, index) => ({
      id: `appointment_${String(index + 1).padStart(3, '0')}`,
      patientId: 'patient_pagination',
      slotId: `slot_pagination_${index + 1}`,
      bookingKind: 'initial',
      itemIds: ['service_snoring'],
      itemLabel: '睡眠呼吸評估',
      status: 'confirmed',
      startsAt: new Date(
        Date.parse('2030-01-02T01:00:00.000Z') + index * 60_000
      ).toISOString()
    }));
    const allFilters = { ...filters, status: 'all' };

    const first = appointmentPage(state, allFilters);
    expect(first).toMatchObject({
      page: 1,
      pageSize: DEFAULT_APPOINTMENT_PAGE_SIZE,
      totalCount: 25,
      totalPages: 2
    });
    expect(first.ids).toHaveLength(20);
    expect(first.ids[0]).toBe('appointment_001');
    expect(first.ids[19]).toBe('appointment_020');

    const second = appointmentPage(state, allFilters, undefined, { page: 2 });
    expect(second.ids).toEqual([
      'appointment_021',
      'appointment_022',
      'appointment_023',
      'appointment_024',
      'appointment_025'
    ]);
    expect(second.allIds.indexOf('appointment_025')).toBe(24);

    const html = renderAppointments(state, allFilters, undefined, new Set(), {
      page: 2
    });
    expect(html).toContain('data-appointment-card="appointment_021"');
    expect(html).toContain('data-appointment-card="appointment_025"');
    expect(html).not.toContain('data-appointment-card="appointment_020"');
  });
});

describe('個管月度工作量', () => {
  it('依完成到診計算不重複患者', () => {
    const state = initialState();
    for (const patient of [PATIENT_A, PATIENT_B]) {
      const appointment = createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient,
          itemIds: ['service_snoring']
        },
        'admin_test_001'
      );
      transitionAppointment(
        state,
        appointment.id,
        'complete',
        'front_desk_test_001'
      );
      assignCaseManager(
        state,
        appointment.id,
        'manager_test_001',
        'admin_test_001'
      );
    }

    const workload = buildWorkload(state);
    expect(workload).toHaveLength(1);
    expect(workload[0]).toMatchObject({
      uniquePatientCount: 2,
      visitCount: 2,
      creditCount: 2
    });
  });
});

// P5（業主 2026-07-27）：可預約時段改為「當日起一個月內」。
//
// 上面每一組測試都跑在凍住的 2030-01-01 上，所以它們證明的是「視窗的內容正確」，
// 不是「視窗跟著今天走」。這一組換兩個完全不同的時鐘各驗一次——那才是這次改動
// 真正要保證的事：先前是寫死的 2030-01-01，任何時鐘下都會產生同一批日期。
describe('可預約視窗跟著今天走', () => {
  const dayNumber = (slotId: string) => Number(slotId.slice(5, 13));
  const asNumber = (isoDate: string) => Number(isoDate.replaceAll('-', ''));
  // 日期加減一律在 UTC 上做。用 `+08:00` 建立再 `toISOString()` 會先倒回 UTC，
  // 於是每一次換算都少八小時——跨月時就會差一天（實測 2031-03-05 + 29 被算成
  // 04-02 而不是 04-03）。這裡只是在數日子，時區不該參與。
  const plusDays = (isoDate: string, days: number) =>
    new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);

  afterAll(() => {
    vi.setSystemTime(FROZEN_NOW);
  });

  for (const today of ['2031-03-05', '2032-11-20']) {
    it(`${today} 產生的時段落在當天起 30 天內`, () => {
      vi.setSystemTime(new Date(`${today}T09:00:00+08:00`));
      const state = initialState();
      const days = state.slots.map((slot) => dayNumber(slot.id));

      expect(days.length).toBeGreaterThan(0);
      // 一格都不在今天之前——那是「已經過去的時段」，患者不該看到。
      expect(Math.min(...days)).toBeGreaterThanOrEqual(asNumber(today));
      // 也不超過視窗長度。29 是「今天算第一天」的第 30 天。
      expect(Math.max(...days)).toBeLessThanOrEqual(
        asNumber(plusDays(today, 29))
      );
    });
  }

  it('視窗長度是 30 天，不是先前的 21 天', () => {
    vi.setSystemTime(new Date('2031-03-05T09:00:00+08:00'));
    const days = new Set(
      initialState().slots.map((slot) => slot.id.slice(5, 13))
    );
    // 每週開週三至週六四天，30 天大約 17 個門診日；21 天只會有 12 個左右。
    expect(days.size).toBeGreaterThan(14);
  });
});

// 2026-07-27 業主需求批次 5（工作臺）。
describe('工作臺批次的新行為', () => {
  const bookOne = (state: any, itemIds: string[]) =>
    createBooking(
      state,
      { slotId: openSlot(state, 'initial').id, patient: PATIENT_A, itemIds },
      'admin_test_001'
    );

  // W5：療程可複選。
  it('登記多個療程，標籤是所有項目串起來的快照', () => {
    const state = initialState();
    const appointment = bookOne(state, [
      'procedure_turbinate_rf',
      'procedure_septum'
    ]);
    expect(appointment.itemIds).toEqual([
      'procedure_turbinate_rf',
      'procedure_septum'
    ]);
    expect(appointment.itemLabel).toBe('下鼻甲 RF、鼻中膈彎曲');
  });

  it('重複的項目只算一次，空清單與未定義的 id 都拒絕', () => {
    const state = initialState();
    expect(
      bookOne(state, ['service_snoring', 'service_snoring']).itemIds
    ).toEqual(['service_snoring']);
    expect(() => bookOne(initialState(), [])).toThrow(/看診項目/);
    expect(() => bookOne(initialState(), ['not_a_real_item'])).toThrow(
      /看診項目/
    );
  });

  // W3：到診但忘了帶健保卡。
  it('忘記帶卡記在這一筆預約上，不動患者的「預計攜帶」', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    transitionAppointment(
      state,
      appointment.id,
      'complete_without_card',
      'front_desk_test_001'
    );
    expect(appointment.status).toBe('completed');
    expect(appointment.nhiCardMissing).toBe(true);
    // PATIENT_A 的 hasNhiCard 是 true，那是「這位患者預計會帶卡」的長期屬性。
    // 這一次忘了帶不該把它改掉，否則下一次預約會顯示他沒有健保卡。
    expect(state.patients.at(-1).hasNhiCard).toBe(true);
    expect(
      state.auditEvents.some(
        (event: any) =>
          event.action === 'appointment_completed_without_nhi_card'
      )
    ).toBe(true);
  });

  it('一般到診不宣稱任何關於健保卡的事', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    transitionAppointment(
      state,
      appointment.id,
      'complete',
      'front_desk_test_001'
    );
    // 不是 false，是**沒有回答**：櫃台沒有被問過這個問題。
    expect(appointment.nhiCardMissing).toBeUndefined();
  });

  // W4：病歷號碼。
  it('病歷號碼存在患者身上，跟著回診指示一起送出', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    transitionAppointment(state, appointment.id, 'complete', 'admin_test_001');
    recordFollowUp(
      state,
      appointment.id,
      {
        status: 'not_required',
        tags: [],
        medicalRecordNumber: '  A-00123  '
      },
      'admin_test_001'
    );
    // 前後空白去掉，其餘原樣保留：那是診所自編的號碼，沒有格式可驗。
    expect(state.patients.at(-1).medicalRecordNumber).toBe('A-00123');
  });

  it('病歷號碼可以用來搜尋預約', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    transitionAppointment(state, appointment.id, 'complete', 'admin_test_001');
    recordFollowUp(
      state,
      appointment.id,
      { status: 'not_required', tags: [], medicalRecordNumber: 'MR-777' },
      'admin_test_001'
    );
    const html = renderAppointments(state, {
      status: 'all',
      kind: 'all',
      query: 'mr-777'
    });
    expect(html).toContain(appointment.id);
    expect(
      renderAppointments(state, {
        status: 'all',
        kind: 'all',
        query: 'mr-888'
      })
    ).not.toContain(appointment.id);
  });

  // W2：已過時未處理。
  it('過看診時間十分鐘仍未處理才算過時', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    const startsAt = Date.parse(appointment.startsAt);
    // 剛過時間、還沒到十分鐘：不算。
    expect(overdueAppointments(state, startsAt + 5 * 60_000)).toEqual([]);
    expect(overdueAppointments(state, startsAt + 11 * 60_000)).toEqual([
      appointment.id
    ]);
    // 已處理的就不再是待辦，不管過了多久。
    transitionAppointment(state, appointment.id, 'complete', 'admin_test_001');
    expect(overdueAppointments(state, startsAt + 60 * 60_000)).toEqual([]);
  });

  it('過時的預約會進首頁待辦', () => {
    const state = initialState();
    const appointment = bookOne(state, ['service_snoring']);
    const tasks = buildOperationalTasks(
      state,
      Date.parse(appointment.startsAt) + 11 * 60_000
    );
    expect(tasks.overdueArrivals).toEqual([appointment.id]);
  });

  // W7：初診資料列印頁。
  describe('初診基本資料列印頁', () => {
    const sheetFor = (state: any, appointmentId: string) =>
      renderIntakeSheet(state, appointmentId);

    it('印出已有的資料，沒收集的欄位留空白底線', () => {
      const state = initialState();
      const appointment = bookOne(state, ['service_snoring']);
      const html = sheetFor(state, appointment.id);
      expect(html).toContain('測試患者甲');
      expect(html).toContain('0912345678');
      // 住址、職業、聯絡人等刻意不線上收集：留白給櫃台或患者手寫，
      // 不印「未填」——紙上要看得出「這裡等著被寫」。
      expect(html).toContain('住址');
      expect(html).toContain('intake-blank');
      expect(html).not.toContain('未填');
    });

    it('身分證字號在畫面上遮罩、列印時完整', () => {
      const state = initialState();
      const appointment = bookOne(state, ['service_snoring']);
      const html = sheetFor(state, appointment.id);
      // 兩個值都在 DOM 裡，由 @media print 切換哪一個顯示。
      expect(html).toContain('intake-screen-only');
      expect(html).toContain('A12****789');
      expect(html).toContain('intake-print-only');
      expect(html).toContain('A123456789');
    });

    it('護照號碼同樣只在合成列印層顯示完整值', () => {
      const state = initialState();
      const appointment = createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: {
            ...PATIENT_A,
            nationalId: '',
            passportNumber: 'P12345678'
          },
          itemIds: ['service_snoring']
        },
        'admin_test_001'
      );
      const html = sheetFor(state, appointment.id);
      expect(html).toContain(
        '<span class="intake-screen-only">P12****678</span>'
      );
      expect(html).toContain(
        '<span class="intake-print-only">P12345678（護照）</span>'
      );
    });

    // CSP 是 style-src 'self'：style 屬性會被整個擋掉，寬度必須走 class。
    it('不含任何 inline style 屬性', () => {
      const state = initialState();
      const appointment = bookOne(state, ['service_snoring']);
      expect(sheetFor(state, appointment.id)).not.toMatch(/\sstyle="/);
    });
  });
});
