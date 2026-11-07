import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatClinicAppointmentTitle } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

// E3-03: ADR-0002 (OWNER-BATCH-2026-09-29B) puts name, phone, birth month/day,
// visit type/service and the patient note in the dedicated appointment
// calendar title. The notice must say that, not the older "no personal data"
// claim.
const notice = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../public/privacy.html'),
  'utf8'
)
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, '');

describe('privacy notice calendar sentence matches the real event title', () => {
  const title = formatClinicAppointmentTitle({
    bookingKind: 'initial',
    itemId: 'service_snoring',
    name: '合成患者甲',
    phoneDigits: '99999999',
    birthMonthDay: '--05-20',
    patientNote: '合成備註'
  });

  it('puts exactly the fields the notice lists into the title', () => {
    expect(title).toBe('止鼾初診/合成患者甲99999999 0520/合成備註');
    for (const wording of [
      '事件標題會顯示您的姓名、電話、出生月日、看診類型與項目，以及備註',
      '僅獲授權的診所人員看得到',
      '不含出生年份、國籍與證件號碼'
    ])
      expect(notice).toContain(wording);
  });

  it('no longer claims the calendar excludes personal data', () => {
    expect(notice).not.toContain('不含您的姓名');
    expect(notice).not.toContain('僅包含診所名稱、掛號別與時間');
  });
});

// Owner decision 2026-10-30 (BD-POLICY §2 as amended in the decision register):
// bookings are kept two years after the visit, then archived (never auto-deleted)
// when there is no later appointment and no legal hold; audit/security logs three
// years; return_sessions 24 hours after expiry. The notice must say that, not the
// older "deleted when the period ends" claim.
describe('privacy notice retention sentence matches the archive policy', () => {
  it('says what the system does with each kind of record', () => {
    for (const wording of [
      '自蒐集之日起至該次看診後兩年',
      '期滿且無新預約、無須依法保留者封存並停止一般使用，不自動刪除',
      '再預約經診所核對確認可取回',
      '稽核與安全紀錄保存三年',
      '回診查詢暫存紀錄過期後24小時移除'
    ])
      expect(notice).toContain(wording);
  });

  it('no longer claims data is deleted when the period ends', () => {
    expect(notice).not.toContain('期滿後刪除');
    // The security section used to leave the audit retention open.
    expect(notice).not.toContain('稽核保存期限仍在確認中');
  });
});
