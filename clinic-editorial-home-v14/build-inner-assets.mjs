import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const sharp = createRequire(import.meta.url)(
  "<HOME>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
);
const root = new URL(".", import.meta.url);
const repo =
  process.env.CLINIC_SOURCE_ROOT || "F:/診所專案/tmp/ui-check-refresh-20261005";
const legacy =
  process.env.CLINIC_LEGACY_ARTWORK ||
  "F:/診所專案/tmp/visual-proof-2026-10-05/design-round-1";
const archive =
  process.env.CLINIC_ASSET_ARCHIVE ||
  "F:/診所專案/tmp/official-site-images-2026-10-05";
const archiveMap = JSON.parse(
  await readFile(archive + "/manifest.json", "utf8"),
);
const derivativeMap = JSON.parse(
  await readFile(legacy + "/asset-map.json", "utf8"),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const records = [];
await mkdir(new URL("assets/inner/", root), { recursive: true });
async function asset(name, file, width, cap, crop, lineage) {
  const source = await readFile(file);
  const official = archiveMap.files.find((r) => file.endsWith("/" + r.file));
  const prepared = derivativeMap.records.find((r) =>
    file.endsWith("/" + r.output),
  );
  if (official && official.sha256 !== hash(source))
    throw Error("Original source changed: " + file);
  if (prepared && prepared.sha256 !== hash(source))
    throw Error("Prepared source changed: " + file);
  let image = sharp(source);
  if (crop)
    image = image.extract({
      left: crop[0],
      top: crop[1],
      width: crop[2],
      height: crop[3],
    });
  const buffer = await image
    .resize({ width, withoutEnlargement: true })
    .png()
    .toBuffer();
  let encoded, q;
  for (const quality of [86, 80, 74, 68, 62, 56]) {
    encoded = await sharp(buffer)
      .webp({ quality, alphaQuality: 80, effort: 6 })
      .toBuffer();
    q = quality;
    if (encoded.length <= cap * 1024) break;
  }
  const meta = await sharp(encoded).metadata();
  const output = "assets/inner/" + name + ".webp";
  await writeFile(new URL(output, root), encoded);
  records.push({
    output,
    bytes: encoded.length,
    width: meta.width,
    height: meta.height,
    quality: q,
    sha256: hash(encoded),
    source: file,
    sourceSha256: hash(source),
    sourceUrl: official?.url || prepared?.sourceUrl,
    sourceCrop: crop,
    preparedLineage: prepared,
    lineage,
    review: "pending clinic medical/content review; original geometry retained",
  });
}
// The home portrait's alpha crop is reused, with a larger page-specific derivative.
const home = JSON.parse(
  await readFile(new URL("asset-manifest.json", root), "utf8"),
);
for (const id of ["yan", "yang"]) {
  const entry = home.records.find(
    (r) => r.output === "assets/doctor-" + id + ".webp",
  );
  const c = entry.sourceCrop;
  await asset(
    "profile-" + id,
    entry.source,
    620,
    24,
    [c.left, c.top, c.width, c.height],
    "Same alpha boundary as homepage; no face retouching",
  );
}
await asset(
  "couple",
  repo + "/apps/web/clinic-source/service-septoplasty.jpg",
  900,
  24,
  [1408, 439, 1152, 864],
  "Existing formal focus from original high-resolution owned couple illustration",
);
await asset(
  "daytime",
  fileURLToPath(new URL("source/daytime-editorial-v1.png", root)),
  420,
  13,
  undefined,
  "Companion redraw of rejected flat-cartoon family; same watercolor language as the authorized sleeping figure; prompt source/daytime-editorial-v1.prompt.txt. Original remains archived.",
);
for (const name of [
  "consult",
  "history",
  "check",
  "allergy",
  "habits",
  "homecare",
])
  await asset(
    "flow-" + name,
    legacy + "/assets/flow-" + name + ".webp",
    240,
    6,
    undefined,
    "Owned flow illustration; meaningful text remains native HTML",
  );
await writeFile(
  new URL("inner-assets.manifest.json", root),
  JSON.stringify(
    {
      scope:
        "page-specific local prototype derivatives; not added to homepage closure",
      records,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    assets: records.length,
    bytes: records.reduce((n, r) => n + r.bytes, 0),
  }),
);
