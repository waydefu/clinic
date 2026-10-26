import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function assertCurrentBoundary(source) {
  const current = source.split('<details>')[0];
  expect(current).toMatch(/已停用|舊的金鑰下載與真實連線步驟已退役/);
  expect(current).not.toMatch(
    /```|CAL_PILOT_SOURCE_KEY_FILE|CAL_PILOT_WRITER_KEY_FILE|Get-Content|新增金鑰\s*→/
  );
  expect(current).toContain('phase-1-decision-register.md');
  expect(source).toMatch(/<details><summary>.*不可照做/);
  expect(source).toMatch(/<\/details>\s*$/);
}

describe('retired Calendar instructions are not current authority', () => {
  for (const file of ['cal-pilot-import.md', 'calendar-go-live.md']) {
    it(`keeps ${file} historical and routes current synthetic preparation`, () => {
      const source = readFileSync(
        new URL(`../docs/runbooks/${file}`, import.meta.url),
        'utf8'
      );
      assertCurrentBoundary(source);
      expect(source.split('<details>')[0]).toContain(
        'cal-pilot-30-day-bidirectional-sync.md'
      );
      expect(() =>
        assertCurrentBoundary(
          source.replace(
            '<details>',
            '```powershell\nGet-Content synthetic-key.json\n```\n<details>'
          )
        )
      ).toThrow();
    });
  }

  it('documents Cloud ADC denial separately from local key compatibility', () => {
    const current = readFileSync(
      new URL('../docs/runbooks/calendar-go-live.md', import.meta.url),
      'utf8'
    ).split('<details>')[0];
    expect(current).toContain('GOOGLE_CALENDAR_AUTH=CLOUD_ADC');
    expect(current).toContain(
      '此模式拒絕 `GOOGLE_SERVICE_ACCOUNT_JSON` 與 `GOOGLE_APPLICATION_CREDENTIALS`'
    );
    expect(current).toContain(
      '本機 `SERVICE_ACCOUNT_JSON` 是程式保留的相容模式'
    );
    expect(current).toContain('不是本輪建立或準備金鑰的指示');
  });
});
