// 瀏覽器對「共用領域規則」的接點。
//
// 規則本身（時段可預約、防重複、狀態轉換、改期）只存在 packages/domain，經
// vendor 同步後由此匯入（ADR-0004）。瀏覽器不再自己寫一份規則，只做兩件事：
//   1. 呼叫共用斷言；
//   2. 把 DomainError 的錯誤碼翻成給使用者看的中文訊息。
//
// 訊息留在瀏覽器這一端，規則留在領域套件，兩者各司其職。
import {
  assertReschedulable,
  assertSlotBookable,
  assertTransitionAllowed,
  assertWithinActiveBookingLimit,
  DomainError
} from '../vendor/domain/index.js';

const MESSAGES = {
  SLOT_UNAVAILABLE: '此時段已無法預約。',
  BOOKING_KIND_MISMATCH: '此時段與掛號別不符，請改選對應的時段。',
  DUPLICATE_ACTIVE_BOOKING:
    '同一位患者同時只能有一筆未完成的預約，請先完成或取消現有預約。',
  TRANSITION_NOT_ALLOWED: '目前的預約狀態無法執行這個動作。',
  INVALID_VALUE: '所選時段無效。'
};

// 把共用斷言丟出的 DomainError 轉成帶中文訊息的一般 Error；其餘錯誤原樣拋出。
// 保留原 DomainError 為 cause，讓錯誤碼與堆疊不會在翻譯時遺失。
function localize(run) {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) {
      throw new Error(MESSAGES[error.code] ?? error.message, { cause: error });
    }
    throw error;
  }
}

export function ensureSlotBookable(slot, bookingKind) {
  try {
    assertSlotBookable(slot, bookingKind);
  } catch (error) {
    // 掛號別不符時給出比通用訊息更具體的提示。這只是措辭；是否允許仍由共用
    // 斷言決定，兩者不會不一致。
    if (
      error instanceof DomainError &&
      error.code === 'BOOKING_KIND_MISMATCH'
    ) {
      throw new Error(
        bookingKind === 'follow_up'
          ? '回診請選擇 15 分或 45 分的時段。'
          : '初診請選擇整點或 30 分的時段。',
        { cause: error }
      );
    }
    if (error instanceof DomainError) {
      throw new Error(MESSAGES[error.code] ?? error.message, { cause: error });
    }
    throw error;
  }
}

export function ensureWithinActiveBookingLimit(activeCount) {
  localize(() => assertWithinActiveBookingLimit(activeCount));
}

export function ensureTransitionAllowed(transition, status) {
  localize(() => assertTransitionAllowed(transition, status));
}

export function ensureReschedulable(
  currentStatus,
  currentSlotId,
  targetSlot,
  bookingKind
) {
  localize(() =>
    assertReschedulable(currentStatus, currentSlotId, targetSlot, bookingKind)
  );
}
