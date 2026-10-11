import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const root = new URL(".", import.meta.url);
const archive =
  process.env.CLINIC_ASSET_ARCHIVE ||
  "F:/診所專案/tmp/official-site-images-2026-10-05";
const originals = JSON.parse(
  await readFile(archive + "/manifest.json", "utf8"),
);
const ledger = JSON.parse(
  await readFile(new URL("medical-content-ledger.json", root), "utf8"),
);
for (const entry of ledger.claims)
  if (
    entry.source.startsWith("https://beauessence.com.tw/wp-content/uploads/")
  ) {
    const file = decodeURIComponent(
      new URL(entry.source).pathname.split("/uploads/")[1],
    ).replace("-scaled.", ".");
    const match = originals.files.find((r) => r.file === file);
    if (!match) throw Error("Missing source snapshot: " + file);
    entry.sourceSnapshot = archive + "/" + match.file;
    entry.sourceSha256 = match.sha256;
  }
const data = JSON.parse(
  await readFile(new URL("home-data.json", root), "utf8"),
);
ledger.homepage = {
  source: "apps/web/public/clinic-content.js",
  sourceSha256: ledger.contentHash,
  review: "pending clinic review; existing canonical facts/copy retained",
  bindings: {
    ".visit-strip": "CLINIC.hours/phone/address",
    "#doctor-profiles": "DOCTORS[0..1], HOME_DOCTOR_PROFILES",
    "#care-process": "HOME_PROCESS_ITEMS[0..3]; exact sourced wording, compact layout",
    "#faq-list": "HOME_FAQS",
    "#tracking-content": "SNORING_SELF_TRACKING",
    "#care a": "NASAL_SERVICES titles/routes",
    ".hero-copy": "Plain-language rendering of HOME_PROCESS_ITEMS[0..3]",
  },
  scope:
    "No new efficacy, eligibility, recovery or booking-policy facts inferred",
};
await writeFile(
  new URL("medical-content-ledger.json", root),
  JSON.stringify(ledger, null, 2),
);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const sharp = createRequire(import.meta.url)(
  "<HOME>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
);
const provenance = [];
for (const name of ["sleep", "daytime"]) {
  const file = "source/" + name + "-editorial-v1.png";
  const b = await readFile(new URL(file, root));
  const info = await sharp(b)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < info.data.length; i += 4)
    if (info.data[i] === 0) transparent++;
  provenance.push({
    file,
    prompt: "source/" + name + "-editorial-v1.prompt.txt",
    sha256: hash(b),
    width: info.info.width,
    height: info.info.height,
    transparentPixels: transparent,
    role: "Non-diagnostic human-experience illustration; no actual patient represented",
    authority:
      "User allowed weak old sleeping-cartoon family to be redrawn; selective exception, originals retained",
    review: "visual draft; clinic/owner approval pending",
  });
}
await writeFile(
  new URL("asset-provenance.json", root),
  JSON.stringify({ generated: provenance, originalsUnchanged: true }, null, 2),
);
const home = JSON.parse(
  await readFile(new URL("asset-manifest.json", root), "utf8"),
);
const inner = JSON.parse(
  await readFile(new URL("inner-assets.manifest.json", root), "utf8"),
);
const allocations = [
  ...home.records.map((r) => ({ ...r, routes: ["/clinic"] })),
  ...inner.records.map((r) => ({
    ...r,
    routes: r.output.includes("profile-")
      ? ["/clinic/doctors"]
      : r.output.includes("septum-") || r.output.includes("couple")
        ? ["/clinic/nasal/septoplasty"]
        : r.output.includes("instrument-")
          ? ["/clinic/nasal/inferior-turbinate-surgery"]
          : r.output.includes("mouthguard")
            ? ["/clinic/nasal/snore-relief-mouthguard"]
            : r.output.includes("daytime") ||
                r.output.match(/flow-(consult|history|check|habits)/)
              ? ["/clinic/nasal/snoring-five-in-one"]
              : [],
  })),
];
await writeFile(
  new URL("asset-use.json", root),
  JSON.stringify(
    {
      scope:
        "Source inventory + intended allocation; final per-route closures in final-verification/results.json",
      originalArchiveCount: originals.files.length,
      allocations,
      reserved: [
        {
          group: "Desktop/mobile baked comparison and five-cause text graphics",
          decision:
            "Retain source snapshots for review; reconstruct meaningful text in native table/definitions instead of shipping duplicate text rasters.",
        },
        {
          group: "Original flat sleeping/daytime cartoons",
          decision: "Archive unchanged; use the two explicitly scoped redraws.",
        },
        {
          group: "Extra flow, outline and decorative symbols",
          decision:
            "Preserve in source library; do not force into empty layout slots. Two prepared flow derivatives are reserved, not served.",
        },
        {
          group: "Non-nasal, aesthetic/service promotional artwork",
          decision:
            "Outside this six-page nasal/sleep scope; retain original archive.",
        },
        {
          group: "Legacy CTA/contact banners",
          decision:
            "Retain original; current navigation/contact/booking remains native, with no old-site redirect.",
        },
      ],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    claims: ledger.claims.length,
    originalFiles: originals.files.length,
    generated: provenance.map((r) => ({
      file: r.file,
      alpha: r.transparentPixels,
    })),
  }),
);
