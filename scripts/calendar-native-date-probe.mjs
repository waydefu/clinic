import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
const values = [
  '2030-01-02T12:00:00Z',
  '2030-01-02T12:00:00+00:00',
  '2030-01-02T12:00:00+08:00',
  '2030-01-02T12:00:00-07:00',
  '2030-01-02T12:00:00.123456789+08:00',
  '2030-01-02t12:00:00z'
];
const results = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const dates = await page.evaluate((inputs) => inputs.map((value) => {
      const raw = Date.parse(value);
      const upper = Date.parse(value.toUpperCase());
      return { value, rawAccepted: Number.isFinite(raw), upperAccepted: Number.isFinite(upper), rawIso: Number.isFinite(raw) ? new Date(raw).toISOString() : null, upperIso: Number.isFinite(upper) ? new Date(upper).toISOString() : null };
    }), values);
    results.push({ engine: name, dates });
  } finally {
    await browser.close();
  }
}
mkdirSync('output/calendar-time-probe', { recursive: true });
writeFileSync('output/calendar-time-probe/native-dates.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
const lower = results.map(({ engine, dates }) => ({ engine, ...dates.find((date) => date.value === values.at(-1)) }));
assert.equal(lower.find((item) => item.engine === 'chromium').rawAccepted, true);
assert.equal(lower.find((item) => item.engine === 'webkit').rawAccepted, false);
assert(results.every((item) => item.dates.every((date) => date.upperAccepted)));
