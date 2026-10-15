import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const plan = readFileSync(
  new URL(
    '../docs/plans/2026-09-18-business-delivery-follow-up.md',
    import.meta.url
  ),
  'utf8'
);
const exportDecision = readFileSync(
  new URL('../docs/adr/0009-business-delivery-export.md', import.meta.url),
  'utf8'
);

// Regression for this engineering plan, not a general secret/contract scanner.
// Count only: failed assertions must never print the source's commercial values.
function commercialDisclosureLineCount(text) {
  return text
    .split(/\r?\n/)
    .filter((line) =>
      /金額[^。]*\d|(?:NT\$|NTD|TWD)\s*[\d,]+|[\d,]+\s*(?:元|萬)/iu.test(line)
    ).length;
}

describe('business delivery plan current/historical boundary', () => {
  it.each(['金額已核對 1／2', 'NT$ 1', 'TWD 1', '1 元'])(
    'detects a synthetic commercial transcription: %s',
    (sample) => expect(commercialDisclosureLineCount(sample)).toBe(1)
  );

  it.each(['測試期20天與最多調整10天', '2026-09-18', 'plan-only'])(
    'does not confuse nonmonetary engineering context: %s',
    (sample) => expect(commercialDisclosureLineCount(sample)).toBe(0)
  );

  it('keeps unnecessary commercial numbers out of the current plan', () => {
    expect(commercialDisclosureLineCount(plan)).toBe(0);
    expect(plan.includes('不轉載報價金額')).toBe(true);
  });

  it('anchors the current CSV-only phase to the accepted export decision', () => {
    expect(exportDecision).toContain('本期只做 CSV');
    expect(exportDecision).toContain('`xlsx` 直接拒絕');
    expect(
      plan.includes('[ADR-0009](../adr/0009-business-delivery-export.md)')
    ).toBe(true);
    expect(plan.includes('已固定本期只做 CSV')).toBe(true);
    expect(plan.includes('不是 XLSX 的實作、政策核准或部署授權')).toBe(true);
    expect(plan.includes('2026-09-18 歷史規劃')).toBe(true);
  });

  it('retains plan-only status and the original historical format wording', () => {
    expect(
      plan.includes('plan-only／待確認需求，非已核准政策或已完成功能')
    ).toBe(true);
    expect(plan.includes('輸出 CSV／XLSX')).toBe(true);
  });
});
