import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Clinic freeze guard: all 30 files remain protected.
 * The owner's 2026-10-11 decision (docs/product/phase-1-decision-register.md,
 * "官網 `/clinic` 改版提前開發與解凍") originally tied the homepage redesign's merge to
 * the next C1 deployment. That was superseded on 2026-10-20: the redesign (Draft PR
 * #249) is merged now; see the 2026-10-20 register entry
 * ("官網 `/clinic` 改版（#249）不等 C1，準備合併"). This rebaseline covers the four
 * files that redesign edits: renderer, stylesheet, public content and asset manifest.
 * On 2026-10-12 the owner also replaced the snoring and septoplasty
 * illustrations (two outputs rehashed, two sources replaced by the new files;
 * the old JPG sources were removed) and asked that no service thumbnail look
 * cut off, so the turbinate and mouthguard outputs were re-rendered as whole
 * circles and rehashed too. The count stays at 30.
 * Later on 2026-10-12 the owner chose visual direction A+B, the old
 * background image and a click-to-load Google map (register entry
 * "官網視覺方向 A+B 與『點了才載入』的 Google 地圖"); only the same four
 * redesign files were rehashed. The new map SVGs are not frozen files.
 * Every other asset, source image, guard failure behaviour and deployment
 * boundary stays exactly as the 2026-09-07 revision left it.
 *
 * 2026-10-19: the owner asked that the booking page share the official site's
 * look ("官網與預約頁風格要相同，背景要用現有素材庫的"); the project lead approved the
 * plan the same day (docs/product/phase-1-decision-register.md, 2026-10-19
 * booking-page reskin entry). That authorises one more rebaseline, of
 * apps/web/public/clinic-booking.css only. Every other hash is unchanged,
 * including soft-green-bg.webp, which the booking page references and never
 * modifies.
 *
 * 2026-10-20: the owner reviewed the restyled page and asked for the clinic info
 * to move above the booking flow, on the first step only, with no text links
 * (docs/product/phase-1-decision-register.md, 2026-10-20 follow-up under the same
 * entry). The two-column layout became one centred column, so
 * apps/web/public/clinic-booking.css was rebaselined once more. Nothing else.
 */
export const CLINIC_FREEZE_BASELINE = {
  'apps/web/public/clinic.html':
    '3b5c0de6caab960f2bdbc883fcfe5a38452bf08c5572be1202fbd647274583e8',
  'apps/web/public/clinic-site.js':
    '7705db8d3b44d22f710138f2587134790045b902687299cdacc7ead2f7959a56',
  'apps/web/public/clinic-site.css':
    '228879322cce9efbec78964e11b00eb2ec753dbe7727bd10a217928c71e37b73',
  'apps/web/public/clinic-content.js':
    '64a8b65bd29f7ee32896a1750d87c341f15bab8c0a6e297c896106c74722b663',
  'apps/web/public/clinic-booking.css':
    '84b381c928eb9cd95b9ec289ceac4fb518e95c8ab15c437bd85c77ea1262d68d',
  'apps/web/clinic-assets.manifest.json':
    '56bce15f8632fd5309689d953e9a0a92a67e6f9c604120fd4ce32e0151ada633',
  'apps/web/public/clinic-assets/care-aftercare.webp':
    '357a5456cd34d5358330982ced3e21d7184d4dff27e22996f61761c9d859ab2b',
  'apps/web/public/clinic-assets/care-environment.webp':
    'e012952d35fe9e6baa277ffa283f22619588130e2f8f5b69f3a81de4f58c2321',
  'apps/web/public/clinic-assets/care-listening.webp':
    '6944e0bb33174e3f1b49450e10689f645e4f87fefdfd019592a6d1ae4b4d00ce',
  'apps/web/public/clinic-assets/care-treatment.webp':
    'cad10418106dc43b6f8496fba3bed1ea5d3dd0f46523b363ed3536435f0d940a',
  'apps/web/public/clinic-assets/clinic-logo.webp':
    'd75608cda33fad2a83d5a67f5dddc78dcd71bbc880aefe8240b59a13a3ed27fe',
  'apps/web/public/clinic-assets/doctor-yan.webp':
    '2ad8d264794a5f7343da35e13576e3173926f95420b9700a8bbbc1c08f0208f5',
  'apps/web/public/clinic-assets/doctor-yang.webp':
    '08d82dea869b851a0ba4e8238c140d47b84dcc783fd3a60e3ebd1639a1adcb45',
  'apps/web/public/clinic-assets/service-mouthguard.webp':
    'f8156e6dbe2090b6fc98a4d4be92c48180dba02f805fda2686d116499cea6d74',
  'apps/web/public/clinic-assets/service-septoplasty.webp':
    '055e5228e201b3441f490579741f09fe1d8c88954e7d1d3ccc8450005c7b94b3',
  'apps/web/public/clinic-assets/service-snoring.webp':
    '1ec8b0b4b872cdecc8a048de462f402ca3ca5c106a2a25db71fb270e6e4b0586',
  'apps/web/public/clinic-assets/service-turbinate.webp':
    '779f0c2454dcafc519e0faf15b5ade9bfd12f73f39219d509db58deaa26ca3e5',
  'apps/web/public/clinic-assets/soft-green-bg.webp':
    '0f2af54beadbf8c0bbe264bf7e53a7fd819ca7fa7ae0f6275107fed9e60977a6',
  'apps/web/clinic-source/care-aftercare.png':
    'c49db2a5060fade84bba3171804f85b305e016d047f4f09645647cc3d9cd1dbe',
  'apps/web/clinic-source/care-environment.png':
    'f92b4e04c04342b5bedeab81c9326d29d316526ac6a1c9471e25944c8ddcb726',
  'apps/web/clinic-source/care-listening.png':
    '32c0c90da144d5a8897e0b7828683962ef589e053988cc5ecc2945621e8bbde8',
  'apps/web/clinic-source/care-treatment.png':
    '8de62c08cfe6d6322e732ebf6f876eaf842ae6fa84eb785ae18915c0debe1e9a',
  'apps/web/clinic-source/clinic-logo.png':
    'cda356f8f1ba409afac959aeab0ebbefc0719534f207d6a558e84f6b435aa288',
  'apps/web/clinic-source/doctor-yan.png':
    '2c0ec54261cc17cc7b02b1eff5614eb326dfb67e0b33b7ae01ee12ea06fbd47c',
  'apps/web/clinic-source/doctor-yang.png':
    'f1316bdc9adb80e9353f9cf673fef18075092af6c036db2d5e6881e05920f2b4',
  'apps/web/clinic-source/service-mouthguard.webp':
    '1625d9e0e3d63bfe59d2d4e9defd016528b7fec51d12bb07533c416f89b48377',
  'apps/web/clinic-source/service-septoplasty-fatigue.webp':
    '943a8e6df68c14cd8d7af9d54985c392775274f813888887a74d313476404d19',
  'apps/web/clinic-source/service-snoring-open-mouth.webp':
    '7383cf9aa0c3218e23d4935aa72a8e1d2879657712e1df60a431deabc237eae0',
  'apps/web/clinic-source/service-turbinate.jpg':
    '0166ed81572ca16aecf3fdbcbbc040b12c5bf8db8c2ad75e317ebd5c4246d457',
  'apps/web/clinic-source/soft-green-bg.png':
    '86df0dd8b065da587c8ce06bfa5cb9c64bb5f329987f526b6aadc3dc1244ee50'
};

/**
 * 純函式檢查器，以供單元測試與 CLI 呼叫。
 * @param {Object} options
 * @param {Record<string, string>} options.baseline
 * @param {Record<string, Buffer|string>} [options.fileBuffers]
 * @param {(path: string) => Promise<Buffer>} [options.reader]
 * @returns {Promise<{ pass: boolean, violations: string[] }>}
 */
export async function verifyClinicFreeze({
  baseline = CLINIC_FREEZE_BASELINE,
  fileBuffers = null,
  reader = null
}) {
  const violations = [];
  const entries = Object.entries(baseline);

  for (const [relativePath, expectedHash] of entries) {
    try {
      let buffer;
      if (fileBuffers && relativePath in fileBuffers) {
        const raw = fileBuffers[relativePath];
        buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      } else if (reader) {
        buffer = await reader(relativePath);
      } else {
        buffer = await readFile(relativePath);
      }

      const actualHash = createHash('sha256').update(buffer).digest('hex');
      if (actualHash !== expectedHash) {
        violations.push(
          `Clinic freeze violation in ${relativePath}: SHA-256 hash mismatch (expected ${expectedHash}, got ${actualHash})`
        );
      }
    } catch (error) {
      violations.push(
        `Clinic freeze violation in ${relativePath}: failed to read file (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }

  return {
    pass: violations.length === 0,
    violations
  };
}

async function main() {
  const result = await verifyClinicFreeze({
    baseline: CLINIC_FREEZE_BASELINE,
    reader: (filePath) => readFile(filePath)
  });

  if (!result.pass) {
    console.error('Clinic Homepage Freeze Guard FAILED:');
    for (const v of result.violations) {
      console.error(`- ${v}`);
    }
    console.error(
      '\nERROR: /clinic homepage and assets are strictly frozen in Phase 1.'
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Clinic Homepage Freeze Guard passed (${Object.keys(CLINIC_FREEZE_BASELINE).length} frozen files verified).`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
