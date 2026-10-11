import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('<HOME>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = fileURLToPath(new URL('.', import.meta.url));
const repo = process.env.CLINIC_SOURCE_ROOT || 'F:/診所專案/tmp/ui-check-refresh-20261005';
const archive = 'F:/診所專案/tmp/official-site-images-2026-10-05';
const legacy = 'F:/診所專案/tmp/visual-proof-2026-10-05/design-round-1/assets';
const originalManifest = JSON.parse(await readFile(archive + '/manifest.json', 'utf8'));
const records = [];
const hash = b => createHash('sha256').update(b).digest('hex');
await mkdir(root + 'assets', { recursive: true });

async function source(file, officialFile) {
  const data = await readFile(file);
  if (officialFile) {
    const expected = originalManifest.files.find(item => item.file === officialFile);
    if (!expected || hash(data) !== expected.sha256) throw Error('Original mismatch: ' + officialFile);
  }
  return { file, bytes: data.length, sha256: hash(data), buffer: data };
}
async function output(name, input, width, capKiB, options = {}) {
  const src = typeof input === 'string' ? await source(input) : input;
  let encoded;
  let quality;
  let smallest;
  for (const candidateWidth of [width, ...(options.resizeFallback || [])]) {
    for (const q of [90, 86, 82, 78, 74, 70, 66, 62]) {
      const candidate = await sharp(src.buffer).resize({ width: candidateWidth, withoutEnlargement: true }).webp({ quality: q, alphaQuality: 75, effort: 6 }).toBuffer();
      if (!smallest || candidate.length < smallest.buffer.length) smallest = { buffer: candidate, quality: q };
      if (candidate.length <= capKiB * 1024) { encoded = candidate; quality = q; break; }
    }
    if (encoded) break;
  }
  if (!encoded) { encoded = smallest.buffer; quality = smallest.quality; }
  await writeFile(root + 'assets/' + name + '.webp', encoded);
  const meta = await sharp(encoded).metadata();
  records.push({ output: 'assets/' + name + '.webp', bytes: encoded.length, requestedCapKiB: capKiB, allocationExceeded: encoded.length > capKiB * 1024, width: meta.width, height: meta.height, quality, sha256: hash(encoded), source: src.file, sourceSha256: src.sha256, ...options });
}
const photos = [
  ['logo', '2025/06/1-1-scaled-1.webp', 1440, 25],
  ['consult', '2025/06/3-1-scaled-1.webp', 960, 14],
  ['reception', '2025/06/4-1-1-scaled-1.webp', 960, 14],
  ['lounge', '2025/02/5-1-1.jpg', 960, 15],
  ['treatment', '2025/02/6-1.jpg', 960, 10],
  ['desk', '2025/06/2-1-scaled-1.webp', 960, 14]
];
for (const [id, file, width, cap] of photos) await output('photo-' + id, await source(archive + '/' + file, file), width, cap, { role: 'owned clinic photo', resizeFallback: id === 'logo' ? [1280] : [900, 800], embeddedMedicalTextReview: id === 'desk' ? 'pending: legacy promotional balloon' : 'none observed' });
await output('logo', repo + '/apps/web/public/clinic-assets/clinic-logo.webp', 240, 5, { role: 'existing clinic identity' });
await output('doctor-yan', repo + '/apps/web/clinic-source/doctor-yan.png', 380, 10, { role: 'existing approved portrait' });
await output('doctor-yang', repo + '/apps/web/clinic-source/doctor-yang.png', 350, 9, { role: 'existing approved portrait' });
await output('sleep-editorial', root + 'source/sleep-editorial-v1.png', 720, 30, { role: 'explicitly authorized replacement illustration', resizeFallback: [680,640], authority: 'User 2026-10-06: old sleeping cartoon may be redrawn' });

const medical = [
  { file: 'service-turbinate.jpg', key: 'nose', cx: .783, cy: .6, halfW: .2168, left: 0, top: 0 },
  { file: 'service-mouthguard.webp', key: 'mouthguard', cx: .822, cy: .585, halfW: .178, left: 640, top: 0 },
  { file: 'service-septoplasty.jpg', key: 'couple', cx: .775, cy: .605, halfW: .225, left: 0, top: 480 }
];
const atlasInputs = [];
const cropRecords = [];
for (const job of medical) {
  const src = await source(repo + '/apps/web/clinic-source/' + job.file);
  const meta = await sharp(src.buffer).metadata();
  const width = Math.round(meta.width * job.halfW * 2);
  const height = Math.round(width * .75);
  const left = Math.max(0, Math.min(meta.width - width, Math.round(meta.width * job.cx - width / 2)));
  const top = Math.max(0, Math.min(meta.height - height, Math.round(meta.height * job.cy - height / 2)));
  const input = await sharp(src.buffer).extract({ left, top, width, height }).resize(640, 480).png().toBuffer();
  atlasInputs.push({ input, left: job.left, top: job.top });
  cropRecords.push({ key: job.key, source: src.file, sourceSha256: src.sha256, crop: { left, top, width, height }, atlas: { left: job.left, top: job.top, width: 640, height: 480 }, method: 'Same source focus as the existing formal asset builder; no anatomy redrawn' });
}
const medicalBuffer = await sharp({ create: { width: 1280, height: 960, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(atlasInputs).png().toBuffer();
await output('medical-atlas', { buffer: medicalBuffer, file: 'existing clinic artwork: declared crops', sha256: hash(medicalBuffer) }, 960, 21, { role: 'owned medical artwork', sources: cropRecords });

const careJobs = ['environment', 'listening', 'treatment', 'aftercare'];
const careInputs = [];
const careSources = [];
for (let i = 0; i < careJobs.length; i++) {
  const src = await source(repo + '/apps/web/public/clinic-assets/care-' + careJobs[i] + '.webp');
  careInputs.push({ input: await sharp(src.buffer).resize(132, 132).png().toBuffer(), left: i * 132, top: 0 });
  careSources.push({ key: careJobs[i], source: src.file, sourceSha256: src.sha256, left: i * 132, top: 0, width: 132, height: 132 });
}
const careBuffer = await sharp({ create: { width: 528, height: 132, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(careInputs).png().toBuffer();
await output('care-atlas', { buffer: careBuffer, file: 'four existing formal care artworks', sha256: hash(careBuffer) }, 528, 7, { role: 'owned care icons; original shapes and colours', sources: careSources });

const soft = await source(repo + '/apps/web/public/clinic-assets/soft-green-bg.webp');
const forest = await source(legacy + '/hero-forest.webp');
const bgBuffer = await sharp({ create: { width: 1200, height: 1256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
  { input: await sharp(soft.buffer).resize(1200, 833).png().toBuffer(), left: 0, top: 0 },
  { input: await sharp(forest.buffer).resize(1200, 423).png().toBuffer(), left: 0, top: 833 }
]).png().toBuffer();
await output('background-atlas', { buffer: bgBuffer, file: 'existing soft-green + owned forest imagery', sha256: hash(bgBuffer) }, 900, 10, { role: 'existing brand backgrounds', sources: [{ source: soft.file, sourceSha256: soft.sha256, region: [0, 0, 1200, 833] }, { source: forest.file, sourceSha256: forest.sha256, region: [0, 833, 1200, 423] }] });

const canonical = await import(pathToFileURL(repo + '/apps/web/public/clinic-content.js').href);
const data = {
  clinic: canonical.CLINIC,
  doctors: canonical.DOCTORS.map(doctor => ({ slug: doctor.slug, name: doctor.name, expertise: doctor.expertise, education: doctor.education.slice(0, 3), alt: doctor.imageAlt })),
  doctorSummaries: canonical.HOME_DOCTOR_PROFILES,
  services: canonical.NASAL_SERVICES.map(item => ({ slug: item.slug, title: item.title })),
  faqs: canonical.HOME_FAQS,
  process: canonical.HOME_PROCESS_ITEMS,
  selfTracking: canonical.SNORING_SELF_TRACKING,
  bookingPath: canonical.BOOKING_PATH,
  photos: photos.map(([id]) => ({ id, url: '/visual-assets/photo-' + id + '.webp' }))
};
await writeFile(root + 'home-data.json', JSON.stringify(data, null, 2) + '\n');
await writeFile(root + 'home-data.js', 'export const data = ' + JSON.stringify(data) + ';\n');
await writeFile(root + 'asset-manifest.json', JSON.stringify({ createdAt: new Date().toISOString(), scope: 'local homepage prototype; original and freeze untouched', imageCount: records.length, imageBytes: records.reduce((n, r) => n + r.bytes, 0), records }, null, 2) + '\n');
console.log(JSON.stringify({ imageCount: records.length, imageKiB: records.reduce((n, r) => n + r.bytes, 0) / 1024 }));
