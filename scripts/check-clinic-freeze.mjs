import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * 診所首頁 /clinic 及其相關資產之第一階段凍結基準 (SHA-256 Hash Manifest)。
 *
 * 依據專案第一階段治理守則 (CLAUDE.md / AGENTS.md / BOOK-MVP-002)：
 * 診所首頁與衛教頁面在第一階段全面凍結 (Freeze ≠ Delete)，禁止任何外觀、文案、
 * 版型、動效、SEO 或品牌結構修改。任何對 /clinic 實體檔案之變更均屬違規。
 */
export const CLINIC_FREEZE_BASELINE = {
  'apps/web/public/clinic.html':
    '3b5c0de6caab960f2bdbc883fcfe5a38452bf08c5572be1202fbd647274583e8',
  'apps/web/public/clinic-site.js':
    '9056dbd4e28a3369541b95661a4805b91b3f9114d1e5b3018ab75ceb5427ce9d',
  'apps/web/public/clinic-site.css':
    '31e4ad6c472c09369ad0f71dede8789da3c92de1fb6b171adcd3c5bc2c08d757',
  'apps/web/public/clinic-content.js':
    '91e0265f4e715e8f7c99fd7c68d408e71731e9d10beb1a95104396f766940397',
  'apps/web/public/clinic-booking.css':
    '58c13447098fccadcfc271c48fee5ef3c832ba8e43c3c0f675d4fba7838cb3cd',
  'apps/web/clinic-assets.manifest.json':
    'a60b2e038d112cab269bd541a274be027e3b930be365408d01ae2e8a9e1951ec',
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
    '0336e510cebfa63f5eea67b4f88d6870e99e1899f541617613e2d1dc4c7a2a28',
  'apps/web/public/clinic-assets/service-septoplasty.webp':
    '437dcbb24b080669c9c2c409f8da5dcaa727597f02f3d10c9c53e66155b006cb',
  'apps/web/public/clinic-assets/service-snoring.webp':
    '13e09041abcb7f22754e1dfecb043d2af4517f3193f3d075e1167959e6f45f02',
  'apps/web/public/clinic-assets/service-turbinate.webp':
    '2facd26d81cd1b28c8c28bc59b07a6d7a807f4719634b3d1f9c5662457ef5970',
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
  'apps/web/clinic-source/service-septoplasty.jpg':
    '5d004fc929ffc3f931e35b0a93f0cca166345f6860fc565ce4c70e3612f4b09a',
  'apps/web/clinic-source/service-snoring-symptoms.jpg':
    '9b29b1b85cdb0d1603298437c8c81a17612aa33556fa96b481fd28bf17d458ec',
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
