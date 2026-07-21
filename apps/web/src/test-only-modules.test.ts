import { describe, expect, it } from 'vitest';
import {
  activeBookingsFor,
  createBooking,
  recordFollowUp,
  rescheduleAppointment,
  sortedAppointments,
  transitionAppointment
} from '../public/modules/appointment-domain.js';
import {
  assignCaseManager,
  buildWorkload
} from '../public/modules/case-management.js';
import {
  generateSlots,
  scheduleImpact
} from '../public/modules/schedule-engine.js';
import { initialState } from '../public/modules/state-schema.js';

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

  it('週三 12:00–20:30 產生初診 14 格、回診 13 格', () => {
    const state = initialState();
    const wednesday = onDate(state, '20300102');
    const initial = wednesday.filter((slot: any) => slot.kind === 'initial');
    const followUp = wednesday.filter((slot: any) => slot.kind === 'follow_up');

    expect(initial).toHaveLength(14);
    expect(followUp).toHaveLength(13);
    expect(localClock(initial[0])).toBe('12:00');
    expect(localClock(initial.at(-1))).toBe('20:00');
    expect(localClock(followUp[0])).toBe('12:15');
    expect(localClock(followUp.at(-1))).toBe('19:45');
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
        itemId: 'service_snoring'
      },
      'admin_test_001'
    );
    const empty = { ...state.schedule, weeklyAvailability: [] };
    expect(
      scheduleImpact(state.appointments, generateSlots(empty))
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
        itemId: 'procedure_septum',
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
          itemId: 'service_snoring',
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
      [{ birthDate: '90-05-20' }, /生日/],
      [{ nationalId: 'X999' }, /身分證/]
    ];
    for (const [patch, message] of cases) {
      expect(() =>
        createBooking(
          state,
          {
            slotId,
            patient: { ...PATIENT_A, ...patch },
            itemId: 'service_snoring'
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
        itemId: 'service_snoring'
      },
      'admin_test_001'
    );

    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: PATIENT_A,
          itemId: 'service_snoring'
        },
        'admin_test_001'
      )
    ).toThrow(/同時只能有 1 筆/);

    expect(() =>
      createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient: PATIENT_B,
          itemId: 'service_aesthetic'
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
        itemId: 'service_snoring'
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
          itemId: 'service_snoring'
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
        itemId: 'service_snoring'
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
    ).toThrow(/相同/);
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
        tags: ['nose_follow_up', 'half_year_repair'],
        noteText: '追蹤鼻塞',
        certificateCopies: 2
      },
      'admin_test_001'
    );

    expect(decision.tags).toEqual(['nose_follow_up', 'half_year_repair']);
    expect(decision.certificateCopies).toBe(2);
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

describe('預約清單排序', () => {
  it('未發生的由近到遠在前，已過去的排在後面', () => {
    const state = initialState();
    const slots = state.slots.filter((item: any) => item.kind === 'initial');
    createBooking(
      state,
      { slotId: slots[4].id, patient: PATIENT_A, itemId: 'service_snoring' },
      'admin_test_001'
    );
    createBooking(
      state,
      { slotId: slots[1].id, patient: PATIENT_B, itemId: 'service_snoring' },
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

describe('個管月度工作量', () => {
  it('依完成到診計算不重複患者', () => {
    const state = initialState();
    for (const patient of [PATIENT_A, PATIENT_B]) {
      const appointment = createBooking(
        state,
        {
          slotId: openSlot(state, 'initial').id,
          patient,
          itemId: 'service_snoring'
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
