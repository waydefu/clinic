import { footer as renderFooter, socials } from "./shell.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const root = new URL(".", import.meta.url);
const repo =
  process.env.CLINIC_SOURCE_ROOT || "F:/診所專案/tmp/ui-check-refresh-20261005";
const contentPath = repo + "/apps/web/public/clinic-content.js";
const canon = await import(pathToFileURL(contentPath));
const contentHash = createHash("sha256")
  .update(await readFile(contentPath))
  .digest("hex");
const template = await readFile(new URL("index.source.html", root), "utf8");
const footer = renderFooter(canon.CLINIC);
const home = template
  .replace("<!-- shared-footer -->", footer)
  .replace("<!-- visit-social -->", socials(canon.CLINIC, "social-links"));
// Generated HTML omits formatting whitespace, retaining all native content and semantics.
await writeFile(
  new URL("index.html", root),
  home.replace(/>\s+</g, "><").trim(),
);
const style = await readFile(new URL("site.css", root), "utf8");
// One stylesheet per route. Shared source is combined at build time only.
await writeFile(new URL("home-site.css", root), style);
if (process.argv.includes("--home-only")) {
  console.log("Built the homepage only; article outputs remain untouched.");
  process.exit(0);
}
const header = home
  .match(/<header class="site-header">[\s\S]*?<\/header>/)[0]
  .replaceAll('href="#care"', 'href="/clinic#care"')
  .replaceAll('href="#team"', 'href="/clinic/doctors"')
  .replaceAll('href="#visit"', 'href="/clinic#visit"')
  .replace(/>\s+</g, "><");
const sourceAssets = JSON.parse(
  await readFile(new URL("inner-assets.manifest.json", root), "utf8"),
);
const wholeAssets = JSON.parse(
  await readFile(new URL("whole-art.manifest.json", root), "utf8"),
);
const claims = [];
const escape = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function claim(id, text, source, pointer) {
  claims.push({
    id,
    text,
    source: source || contentPath,
    sourceSha256: source ? undefined : contentHash,
    pointer,
    review:
      "pending clinic review; sourced existing content, no new efficacy assertion",
  });
  // Source/review bindings live in the ledger; runtime contains the same native text.
  return escape(text);
}
function p(id, text, pointer) {
  return `<p>${claim(id, text, undefined, pointer)}</p>`;
}
function list(id, values, pointer) {
  return `<ul>${values.map((value, i) => `<li>${claim(id + "-" + i, value, undefined, pointer + "[" + i + "]")}</li>`).join("")}</ul>`;
}
function picture(name, alt, className = "", lazy = true) {
  const r = sourceAssets.records.find(
    (r) => r.output === "assets/inner/" + name + ".webp",
  );
  if (!r) throw Error(name);
  const readableAlt = alt
    .replace(/^原官網/, "")
    .replace("的重畫插畫", "的情境插畫");
  return `<img class="${className}" src="/visual-assets/inner/${name}.webp" width="${r.width}" height="${r.height}" alt="${escape(readableAlt)}"${lazy ? ' loading="lazy"' : ""}>`;
}
function wholeArt(name, alt, { mobile, description, lazy = true } = {}) {
  const record = wholeAssets.records.find((r) => r.name === name);
  if (
    !record ||
    record.operation !== "resize-whole-only" ||
    record.crop !== null
  )
    throw Error("Whole-art preservation required: " + name);
  const image = `<img src="/visual-assets/whole/${name}.webp" width="${record.width}" height="${record.height}" alt="${escape(alt)}" data-whole-art="${name}"${description ? ` aria-describedby="${description}"` : ""}${lazy ? ' loading="lazy"' : ""}>`;
  const alternative = mobile
    ? wholeAssets.records.find((r) => r.name === mobile)
    : null;
  const picture = mobile
    ? `<picture><source media="(max-width:768px)" srcset="/visual-assets/whole/${mobile}.webp" width="${alternative.width}" height="${alternative.height}">${image}</picture>`
    : image;
  return `<figure class="whole-art">${picture}<figcaption><button type="button" class="text-link" data-image-open aria-label="放大${escape(alt)}">放大閱讀 <span aria-hidden="true">↗</span></button></figcaption></figure>`;
}
function imageTranscript(name, id, lines) {
  const record = wholeAssets.records.find((r) => r.name === name);
  return `<details class="graphic-transcript" id="${id}"><summary>看圖中文字</summary>${lines.map((text, i) => `<p>${claim(id + "-" + i, text, record.sourceUrl, "complete original graphic, text " + i)}</p>`).join("")}</details>`;
}
function breadcrumbs(title) {
  return `<nav class="breadcrumbs page-width" aria-label="所在位置"><a href="/clinic">診所首頁</a><span aria-hidden="true">／</span><span aria-current="page">${title}</span></nav>`;
}
function consultation() {
  return `<aside class="consultation page-width"><p>想了解自己的鼻塞或睡眠狀況？</p><a class="booking-link" href="/booking">預約門診</a><a class="text-link" href="/clinic#visit">門診時間與交通 ↗</a></aside>`;
}
function document(title, kind, main) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}｜一森渼診所設計原型</title><link rel="stylesheet" href="/prototype/article-site.css"><script type="module" src="/prototype/article.js"></script></head><body class="article-page ${kind}"><a class="skip-link" href="#main">跳至主要內容</a><div class="preview-note">本機設計樣稿 · 醫療圖文待診所審閱</div>${header}<main id="main">${breadcrumbs(title)}${main}${consultation()}</main>${footer}</body></html>`;
}
function notes(service, index) {
  return `<section class="clinical-notes page-width"><h2>看診前與術後照護</h2><div>${service.sections
    .slice(index)
    .map(
      (section, i) =>
        `<details><summary>${escape(section.heading)}</summary>${section.paragraphs?.map((t, j) => p(service.slug + "-note-" + i + "-" + j, t, "NASAL_SERVICES.sections")).join("") || ""}${section.bullets ? list(service.slug + "-note-" + i, section.bullets, "NASAL_SERVICES.sections") : ""}</details>`,
    )
    .join("")}</div></section>`;
}
function turbinate() {
  const service = canon.NASAL_SERVICES[1];
  const source =
    "https://beauessence.com.tw/wp-content/uploads/2025/05/0506-scaled.png";
  const columns = [
    "儀器",
    "治療部位",
    "治療原理",
    "手術時間",
    "復發機率",
    "住院需求",
    "傷口結痂",
    "塞棉條",
    "術後照護",
  ];
  // Literal transcription of the original nine-column comparison; no rankings/crowns.
  const rows = [
    [
      "雙極射頻",
      "下鼻甲、軟顎、懸雍垂、舌根",
      "低溫加熱；氣化使蛋白質變性；不破壞外層黏膜；能有效維持功能",
      "短，30分鐘",
      "低",
      "×",
      "少",
      "×",
      "後遺症少，復原時間約一週",
    ],
    [
      "微創止鼾凝結消融",
      "下鼻甲",
      "電頻凝結；由外層破壞；稍微破壞外層黏膜",
      "短，30～60分鐘",
      "低",
      "×",
      "較多",
      "×",
      "有可能沾黏，復原時間約兩週",
    ],
    [
      "傳統手術",
      "下鼻甲",
      "直接切除下鼻甲；破壞性最大；出血量大",
      "長",
      "低；後遺症會引發空鼻症",
      "需住院3～5天",
      "最多",
      "○",
      "沾黏機率大，復原時間約4週",
    ],
    [
      "廣達雷射",
      "下鼻甲",
      "低溫加熱；溫度不均；舊式儀器",
      "短",
      "高；因器械較老舊",
      "×",
      "較多",
      "○",
      "有可能沾黏，復原時間約兩週",
    ],
  ];
  const table = `<div class="comparison-scroll" role="region" aria-label="四種處理方式的九欄比較，可水平捲動" tabindex="0"><table><caption>四種處理方式的九欄比較</caption><thead><tr>${columns.map((t) => `<th scope="col">${t}</th>`).join("")}</tr></thead><tbody>${rows.map((row, i) => `<tr>${row.map((cell, j) => (j === 0 ? `<th scope="row">${claim("comparison-" + i + "-" + j, cell, source, "row " + i + ", column " + j)}</th>` : `<td>${claim("comparison-" + i + "-" + j, cell, source, "row " + i + ", column " + j)}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
  return document(
    service.title,
    "turbinate-page",
    `<section class="opening-graphic page-width"><h1>下鼻甲手術</h1>${wholeArt("whole-turbinate", "下鼻甲手術完整圖文與鼻腔示意", { description: "turbinate-text", lazy: false })}<div class="graphic-lead" id="turbinate-text"><h2>先了解下鼻甲，再討論處理方式。</h2>${p("turbinate-intro", service.intro, "NASAL_SERVICES[1].intro")}${imageTranscript("whole-turbinate", "turbinate-original-copy", ["下鼻甲肥大常導致鼻塞", "呼吸不順甚至影響睡眠品質", "精準處理肥大的下鼻甲組織", "讓您輕鬆呼吸不卡卡！"])}<details class="graphic-transcript"><summary>看成因與症狀的文字說明</summary>${list("turbinate-causes", service.sections[0].bullets, "NASAL_SERVICES[1].sections[0].bullets")}</details></div></section><section class="comparison-section page-width" id="comparison"><h2>不同方式，一起比較。</h2>${wholeArt("whole-comparison-wide", "四種處理方式的完整九欄比較", { mobile: "whole-comparison-tall", description: "comparison-text" })}<details class="graphic-transcript" id="comparison-text"><summary>看可放大的文字版比較</summary>${table}</details></section><section class="instrument-section page-width"><h2>兩種器械與處理方式</h2>${wholeArt("whole-instruments", "雙極射頻與微創止鼾凝結消融完整器械比較", { description: "instrument-text" })}<div id="instrument-text" class="instrument-copy"><p>圖中左側是雙極射頻，右側是微創止鼾凝結消融。各項比較可對照上方文字表格，並在看診時確認。</p></div></section>${notes(service, 1)}`,
  );
}
function doctors() {
  const profile = (doctor, i) =>
    `<section class="editorial-profile profile-${i ? "yang" : "yan"} page-width" id="${doctor.slug}"><div class="profile-identity"><p>${i ? "麻醉科" : "耳鼻喉科"}</p><h2>${escape(doctor.name.split(" ")[0])}<span>${escape(doctor.name.split(" ")[1])}</span></h2>${p("doctor-summary-" + i, doctor.summary, "DOCTORS[" + i + "].summary")}</div><figure class="profile-portrait">${picture("profile-" + (i ? "yang" : "yan"), doctor.imageAlt, "", false)}</figure><div class="profile-care"><h3>看診與照護項目</h3>${list("doctor-expertise-" + i, doctor.expertise, "DOCTORS[" + i + "].expertise")}</div><div class="profile-education"><h3>學經歷</h3>${list("doctor-education-" + i, doctor.education, "DOCTORS[" + i + "].education")}</div>${doctor.publications.length ? `<div class="profile-publications"><h3>著作與翻譯</h3>${list("doctor-publications-" + i, doctor.publications, "DOCTORS[" + i + "].publications")}</div>` : ""}</section>`;
  return document(
    "醫師團隊",
    "doctors-page",
    `<section class="team-opening page-width"><h1>醫師團隊</h1><nav aria-label="前往醫師介紹"><a class="text-link" href="#yan-cheng-an">顏正安 院長 ↓</a><a class="text-link" href="#yang-sheng-feng">楊昇峯 醫師 ↓</a></nav></section>${canon.DOCTORS.map(profile).join("")}`,
  );
}
function snoring() {
  const service = canon.NASAL_SERVICES[0];
  const causes = service.sections[1];
  const definitions = causes.bullets
    .map((text, i) => {
      const colon = text.indexOf("：");
      const title = colon < 0 ? text : text.slice(0, colon);
      const detail = colon < 0 ? "" : text.slice(colon + 1);
      return `<div><dt>${claim("snore-cause-title-" + i, title, undefined, "NASAL_SERVICES[0].sections[1].bullets[" + i + "]")}</dt>${detail ? `<dd>${claim("snore-cause-detail-" + i, detail, undefined, "NASAL_SERVICES[0].sections[1].bullets[" + i + "]")}</dd>` : ""}</div>`;
    })
    .join("");
  const flowImages = ["consult", "history", "check", "habits"];
  return document(
    service.title,
    "snoring-page",
    `<section class="snoring-opening page-width"><div class="snoring-stage"><h1>止鼾<br><span>五合一</span></h1><figure><img src="/visual-assets/sleep-editorial.webp" width="640" height="427" alt="成人睡眠情境插畫"></figure></div><div class="snoring-intro">${p("snore-intro", service.intro, "NASAL_SERVICES[0].intro")}<a class="text-link" href="#causes">從五類原因開始了解 ↓</a></div></section><section class="experience-band"><div class="page-width experience-spread"><figure>${picture("daytime", "成人白天疲倦情境插畫")}<figcaption>白天的精神狀況</figcaption></figure><div><h2>夜晚的呼吸，<br>白天的精神。</h2>${p("snore-body", service.sections[0].paragraphs[0], "NASAL_SERVICES[0].sections[0].paragraphs[0]")}</div></div></section><section class="whole-causes page-width" id="causes"><h2>打鼾的五個常見成因</h2>${wholeArt("whole-snoring-causes", "五類打鼾原因的完整圖文", { description: "causes-text" })}<details class="graphic-transcript" id="causes-text"><summary>看五類原因的文字說明</summary>${p("snore-multiple", causes.paragraphs[0], "NASAL_SERVICES[0].sections[1].paragraphs[0]")}<dl class="cause-definitions">${definitions}</dl></details></section><section class="assessment-flow page-width"><div><h2>看診時，怎麼一步步了解？</h2>${list("snore-signals", service.sections[2].bullets, "NASAL_SERVICES[0].sections[2].bullets")}</div><ul class="assessment-entries">${service.sections[3].bullets.map((text, i) => `<li>${picture("flow-" + flowImages[i], "門診評估流程插畫")}<p>${claim("snore-flow-" + i, text, undefined, "NASAL_SERVICES[0].sections[3].bullets[" + i + "]")}</p></li>`).join("")}</ul></section><section class="tracking-resources page-width"><details><summary>想先記錄自己的鼾聲？</summary>${service.resources.paragraphs.map((t, i) => p("snore-resource-" + i, t, "SNORING_SELF_TRACKING.paragraphs[" + i + "]")).join("")}<div>${service.resources.links.map((link) => `<a class="text-link" target="_blank" rel="noopener noreferrer" href="${escape(link.href)}">${escape(link.label)} ↗</a>`).join("")}</div></details></section>`,
  );
}
function septoplasty() {
  const service = canon.NASAL_SERVICES[2];
  const source =
    "https://beauessence.com.tw/wp-content/uploads/2025/06/鼻中隔手術2025.webp";
  const types = [
    ["C型彎曲", "原圖標示此為最常見的型態。鼻中隔呈C形彎曲，位於鼻腔前部。"],
    ["S型彎曲", "鼻中隔呈S形彎曲，通常位於鼻腔中、後部。"],
    ["尾端彎曲", "鼻中隔在鼻腔尾端彎曲，靠近鼻咽部。"],
    ["鼻中隔骨刺", "鼻中隔上長骨刺，通常位於鼻腔前、中部。"],
    ["鼻中隔增生", "鼻中隔組織增生，通常位於鼻腔下部。"],
  ];
  return document(
    service.title,
    "septoplasty-page",
    `<section class="septal-opening"><div class="page-width"><h1>鼻中隔手術</h1><div class="septal-scene"><div><h2>先了解，鼻子中間的構造。</h2>${p("septal-intro", service.intro, "NASAL_SERVICES[2].intro")}<a class="text-link" href="#types">看五種型態 ↓</a></div><figure>${picture("couple", "伴侶夜間睡眠插畫", "", false)}</figure></div></div></section><section class="types-spread page-width" id="types"><h2>彎曲的型態，可以不一樣。</h2>${wholeArt("whole-septum-types", "五種鼻中隔型態與說明的完整圖文", { description: "types-text" })}<details class="graphic-transcript" id="types-text"><summary>看五種型態的文字說明</summary><dl class="type-definitions">${types.map(([title, detail], i) => `<div><dt>${claim("septal-type-" + i, title, source, "column " + i)}</dt><dd>${claim("septal-description-" + i, detail, source, "column " + i)}</dd></div>`).join("")}</dl></details></section><section class="septal-decision page-width"><h2>鼻中隔彎曲，<br>一定要手術嗎？</h2><div>${service.sections[0].paragraphs.map((t, i) => p("septal-treatment-" + i, t, "NASAL_SERVICES[2].sections[0].paragraphs[" + i + "]")).join("")}</div></section>${notes(service, 1)}`,
  );
}
function mouthguard() {
  const service = canon.NASAL_SERVICES[3];
  const steps = [
    ["評估", service.intro, "NASAL_SERVICES[3].intro"],
    ["製作", service.highlights[1], "NASAL_SERVICES[3].highlights[1]"],
    [
      "調整",
      service.sections[2].bullets[1],
      "NASAL_SERVICES[3].sections[2].bullets[1]",
    ],
    [
      "配戴",
      service.sections[2].bullets[0],
      "NASAL_SERVICES[3].sections[2].bullets[0]",
    ],
    [
      "照護",
      service.sections[2].bullets[3],
      "NASAL_SERVICES[3].sections[2].bullets[3]",
    ],
  ];
  return document(
    service.title,
    "mouthguard-page",
    `<section class="opening-graphic page-width"><h1>止鼾好眠牙套</h1>${wholeArt("whole-mouthguard", "客製牙套實物及特點的完整圖文", { description: "appliance-text", lazy: false })}<div class="graphic-lead" id="appliance-text"><h2>先看清楚實物，<br>再了解配戴安排。</h2>${p("appliance-intro", service.intro, "NASAL_SERVICES[3].intro")}${imageTranscript("whole-mouthguard", "appliance-original-copy", ["客製化專屬於您的牙套！", "非侵入式", "有效治療", "配戴舒適", "方便清潔"])}</div></section><section class="appliance-sequence page-width"><h2>從評估，到每天的照護。</h2><ol>${steps.map(([title, text, pointer], i) => `<li><h3>${title}</h3><p>${claim("appliance-step-" + i, text, undefined, pointer)}</p></li>`).join("")}</ol></section><section class="appliance-function page-width"><h2>了解用途與作用方式。</h2>${list("appliance-function", service.sections[1].bullets, "NASAL_SERVICES[3].sections[1].bullets")}</section><section class="appliance-care page-width"><h2>配戴與清潔</h2>${list("appliance-care", service.sections[2].bullets, "NASAL_SERVICES[3].sections[2].bullets")}</section>`,
  );
}
for (const [file, render] of [
  ["turbinate", turbinate],
  ["doctors", doctors],
  ["snoring", snoring],
  ["septoplasty", septoplasty],
  ["mouthguard", mouthguard],
])
  await writeFile(
    new URL(file + ".html", root),
    render().replace(/>\s+</g, "><").trim(),
  );
await writeFile(
  new URL("medical-content-ledger.json", root),
  JSON.stringify(
    {
      scope:
        "prototype only; original facts/canonical medical prose retained, no medical signoff inferred",
      contentHash,
      claims,
    },
    null,
    2,
  ),
);
await writeFile(
  new URL("article-site.css", root),
  style + "\n" + (await readFile(new URL("article.css", root), "utf8")),
);
console.log(
  JSON.stringify({
    pages: ["turbinate", "doctors", "snoring", "septoplasty", "mouthguard"],
    claims: claims.length,
  }),
);
