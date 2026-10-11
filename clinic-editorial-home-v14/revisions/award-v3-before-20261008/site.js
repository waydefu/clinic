import { data } from "/prototype/home-data.js";

// Native nodes only. The prototype uses the repository's unchanged CSP,
// including require-trusted-types-for 'script'; no innerHTML or permissive policy.
function node(tag, text, attrs = {}) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, String(value));
  return element;
}
const clinic = data.clinic;
const quickHours = document.querySelector("#quick-hours");
for (const line of clinic.hours) quickHours.append(node("span", line));
for (const id of ["quick-phone", "visit-phone"]) {
  const element = document.querySelector("#" + id);
  element.textContent = clinic.phoneDisplay;
  element.href = clinic.phoneHref;
}
for (const id of ["quick-address", "visit-address"])
  document.querySelector("#" + id).textContent = clinic.address;
for (const line of clinic.hours)
  document.querySelector("#visit-hours").append(node("li", line));
document.querySelector("#map-link").href =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(clinic.address);
for (let i = 0; i < data.doctors.length; i++) {
  const doctor = data.doctors[i];
  const [name, position] = doctor.name.split(" ");
  const profile = node("article", null, {
    class: "doctor-profile doctor-" + (i ? "yang" : "yan"),
  });
  const portraitKey = "doctor-" + (i ? "yang" : "yan");
  profile.append(
    node("img", null, {
      src: doctor.image,
      alt: doctor.alt,
      width: data.assets[portraitKey].width,
      height: data.assets[portraitKey].height,
      loading: "lazy",
      class: "doctor-portrait",
    }),
  );
  const copy = node("div", null, { class: "doctor-copy" });
  copy.append(
    node("p", i ? "麻醉科" : "耳鼻喉科", { class: "doctor-specialty" }),
  );
  const heading = node("h3", name);
  heading.append(node("span", position));
  copy.append(heading);
  const summary = data.doctorSummaries.find(
    (item) => item.slug === doctor.slug,
  );
  copy.append(node("p", summary.focus, { class: "doctor-focus" }));
  copy.append(node("p", summary.summary));
  const credentials = node("ul", null, { class: "doctor-credentials" });
  for (const line of doctor.education) credentials.append(node("li", line));
  copy.append(
    credentials,
    node("a", "醫師介紹 ↗", {
      href: "/clinic/doctors/" + doctor.slug,
      class: "text-link",
    }),
  );
  profile.append(copy);
  document.querySelector("#doctor-profiles").append(profile);
}
const careKeys = ["environment", "listening", "treatment", "aftercare"];
const careFeatures = [
  { title: "候診空間", description: "先看看診間、櫃台與候診區。" },
  data.process[0],
  data.process[2],
  data.process[3],
];
for (let i = 0; i < careFeatures.length; i++) {
  const entry = node("div", null, { class: "process-entry" });
  const copy = node("div");
  copy.append(
    node("h3", careFeatures[i].title),
    node("p", careFeatures[i].description),
  );
  entry.append(copy);
  document.querySelector("#care-process").append(entry);
}
for (const faq of data.faqs) {
  const details = node("details");
  details.append(node("summary", faq.question), node("p", faq.answer));
  document.querySelector("#faq-list").append(details);
}
for (const paragraph of data.selfTracking.paragraphs)
  document.querySelector("#tracking-content").append(node("p", paragraph));
for (const link of data.selfTracking.links)
  document
    .querySelector("#tracking-content")
    .append(
      node("a", link.label + " ↗", {
        href: link.href,
        target: "_blank",
        rel: "noopener noreferrer",
        class: "text-link",
      }),
    );

const mobileMenu = document.querySelector(".mobile-navigation");
mobileMenu.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    mobileMenu.open = false;
  }),
);
mobileMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mobileMenu.open = false;
    mobileMenu.querySelector("summary").focus();
  }
});

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const hero = document.querySelector(".hero-scene");
const heroPhoto = document.querySelector("#hero-photo");
const play = document.querySelector("#photo-play");
const status = document.querySelector("#photo-status");
const labels = {
  logo: "入口標誌牆",
  consult: "看診空間",
  reception: "診所櫃台",
  lounge: "候診空間",
  treatment: "處置空間",
  desk: "診桌",
};
let current = 0;
let paused = reduced.matches;
let timer;
let generation = 0;
function photoError(scope, message) {
  const element = document.querySelector("#" + scope + "-error");
  element.textContent = message || "";
  element.hidden = !message;
  if (message) status.textContent = message;
}
function revealPhoto(image) {
  image.getAnimations().forEach((animation) => animation.cancel());
  if (!reduced.matches && !document.hidden)
    image.animate([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(.2,0,0,1)",
    });
}
function syncPlayback() {
  clearTimeout(timer);
  play.hidden = reduced.matches;
  play.setAttribute("aria-label", paused ? "播放輪播" : "暫停輪播");
  play.firstElementChild.textContent = paused ? "▷" : "Ⅱ";
  hero.dataset.playback = reduced.matches
    ? "manual-only"
    : paused
      ? "paused"
      : document.hidden
        ? "hidden"
        : "playing";
  if (!reduced.matches && !paused && !document.hidden)
    timer = setTimeout(async () => {
      await showPhoto((current + 1) % data.photos.length, false);
      syncPlayback();
    }, 7000);
}
async function showPhoto(index, manual) {
  const ticket = ++generation;
  photoError("hero", "");
  const photo = data.photos[index];
  const preload = new Image();
  preload.src = photo.url;
  try {
    await preload.decode();
  } catch {
    if (ticket === generation) {
      paused = true;
      photoError("hero", "照片暫時無法載入，請點選照片圓點再試一次。");
      syncPlayback();
    }
    return;
  }
  if (ticket !== generation) return;
  current = index;
  heroPhoto.src = photo.url;
  revealPhoto(heroPhoto);
  heroPhoto.alt = "一森渼診所" + labels[photo.id];
  hero.dataset.photo = photo.id;
  hero
    .querySelectorAll("[data-photo-index]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.photoIndex) === index),
      ),
    );
  if (manual) status.textContent = "目前顯示：" + labels[photo.id];
}
for (let i = 0; i < data.photos.length; i++) {
  const button = node("button", null, {
    type: "button",
    "aria-label": "查看" + labels[data.photos[i].id],
    "aria-pressed": i === 0,
    "data-photo-index": i,
  });
  button.append(node("span", null, { "aria-hidden": "true" }));
  button.addEventListener("click", async () => {
    paused = true;
    syncPlayback();
    await showPhoto(i, true);
  });
  button.addEventListener("focus", () => {
    paused = true;
    generation++;
    syncPlayback();
  });
  document.querySelector("#hero-dots").append(button);
}
play.addEventListener("click", () => {
  if (reduced.matches) return;
  paused = !paused;
  if (paused) generation++;
  syncPlayback();
});
reduced.addEventListener("change", () => {
  paused = true;
  generation++;
  heroPhoto.getAnimations().forEach((animation) => animation.cancel());
  document
    .querySelector("#environment-photo")
    .getAnimations()
    .forEach((animation) => animation.cancel());
  if (reduced.matches && document.activeElement === play)
    document.querySelector('[data-photo-index="' + current + '"]').focus();
  syncPlayback();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) generation++;
  syncPlayback();
});
window.addEventListener("pagehide", () => {
  generation++;
  clearTimeout(timer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) syncPlayback();
});
syncPlayback();

let environmentGeneration = 0;
const environmentChoices = ["consult", "lounge", "reception"];
for (const id of environmentChoices) {
  const button = node("button", labels[id], {
    type: "button",
    "aria-pressed": id === "consult",
    "data-environment-photo": id,
  });
  button.addEventListener("click", async () => {
    const ticket = ++environmentGeneration;
    photoError("environment", "");
    const photo = data.photos.find((item) => item.id === id);
    const preloaded = new Image();
    preloaded.src = photo.url;
    try {
      await preloaded.decode();
    } catch {
      if (ticket === environmentGeneration)
        photoError("environment", "照片暫時無法載入，請再次點選空間名稱重試。");
      return;
    }
    if (ticket !== environmentGeneration) return;
    const image = document.querySelector("#environment-photo");
    image.src = photo.url;
    image.alt = "一森渼診所" + labels[id];
    revealPhoto(image);
    document.querySelector("#environment-caption").textContent = labels[id];
    document
      .querySelectorAll("[data-environment-photo]")
      .forEach((item) =>
        item.setAttribute(
          "aria-pressed",
          String(item.dataset.environmentPhoto === id),
        ),
      );
    status.textContent = "目前顯示：" + labels[id];
  });
  document.querySelector("#environment-selectors").append(button);
}

document.addEventListener("whole-image-open",()=>{paused=true;generation++;syncPlayback();});

function installWholeImageReader() {
  const triggers = [...document.querySelectorAll('[data-image-open]')];
  if (!triggers.length) return;
  const make = (tag, text, attrs = {}) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,String(value));
    return element;
  };
  const dialog = make('dialog',null,{class:'image-reader','aria-labelledby':'image-reader-title'});
  const title = make('h2','圖文放大閱讀',{id:'image-reader-title'});
  const close = make('button','關閉',{type:'button',class:'reader-close'});
  const header = make('div',null,{class:'reader-header'});header.append(title,close);
  const fit = make('button','完整圖',{type:'button'});
  const minus = make('button','縮小',{type:'button','aria-label':'縮小圖片'});
  const plus = make('button','放大',{type:'button','aria-label':'放大圖片'});
  const value = make('output','100%',{'aria-live':'polite'});
  const tools = make('div',null,{class:'reader-tools','aria-label':'圖片縮放'});tools.append(fit,minus,value,plus);
  const viewport = make('div',null,{class:'reader-viewport',tabindex:'0','aria-label':'完整圖文，可捲動查看放大內容'});
  const image = make('img',null,{class:'reader-image',alt:''});viewport.append(image);
  const status = make('p','',{class:'reader-status',role:'status'});
  dialog.append(header,tools,viewport,status);document.body.append(dialog);
  let scale=1,base=0,lastTrigger;
  function resize(next){scale=Math.max(1,Math.min(4,next));image.style.width=Math.round(base*scale)+'px';value.textContent=Math.round(scale*100)+'%';minus.disabled=scale===1;plus.disabled=scale===4;}
  fit.addEventListener('click',()=>{resize(1);viewport.scrollTo(0,0);});
  minus.addEventListener('click',()=>resize(scale-.5));
  plus.addEventListener('click',()=>resize(scale+.5));
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>lastTrigger?.focus());
  image.addEventListener('error',()=>{status.textContent='圖片暫時無法載入，請關閉後再試一次。';});
  for(const trigger of triggers)trigger.addEventListener('click',()=>{
    const source=trigger.closest('figure').querySelector('img');lastTrigger=trigger;
    title.textContent=source.alt;status.textContent='放大後，可左右、上下捲動查看完整圖文。';
    image.src=source.currentSrc||source.src;image.alt=source.alt;
    image.width=source.naturalWidth||Number(source.getAttribute('width'));
    image.height=source.naturalHeight||Number(source.getAttribute('height'));
    dialog.showModal();base=viewport.clientWidth;resize(1);viewport.scrollTo(0,0);close.focus();
    document.dispatchEvent(new Event('whole-image-open'));
  });
}
installWholeImageReader();

const FOOTER_DATA={"name":"一森渼診所","englishName":"Beau Essence Clinic","phoneDisplay":"02-2577-1314","phoneHref":"tel:+886225771314","tollFreeDisplay":"0800-000-913","tollFreeHref":"tel:+886800000913","address":"臺北市松山區光復北路112號2樓","addressStructured":{"streetAddress":"光復北路112號2樓","addressLocality":"松山區","addressRegion":"臺北市","addressCountry":"TW"},"hours":["週三至週五 12:00–20:00","週六 10:00–18:00"],"socialLinks":[{"label":"LINE","href":"https://page.line.me/821tzbtx"},{"label":"Instagram","href":"https://www.instagram.com/beauessence.tw"},{"label":"Messenger","href":"https://m.me/575723225620285"},{"label":"Facebook","href":"https://www.facebook.com/beauessencetaipei/"}]};
// Shared footer enhancement, using native nodes under the existing Trusted Types boundary.
// The build embeds only canonical public clinic facts; the static fallback remains useful without JS.
function installFooter(clinic) {
  const element = (tag, text, attrs = {}) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const link = (text, href, className) =>
    element("a", text, { href, ...(className ? { class: className } : {}) });
  const root = document.querySelector(".site-footer > .page-width");
  if (!root) return;
  const main = element("div", null, { class: "footer-main" });
  const brand = element("div", null, { class: "footer-brand" });
  const home = link(null, "/clinic", "brand");
  home.setAttribute("aria-label", "一森渼診所首頁");
  home.append(
    element("img", null, {
      src: "/visual-assets/logo.webp",
      width: "240",
      height: "134",
      alt: "一森渼 Beau Essence",
      loading: "lazy",
    }),
  );
  const name = element("p", clinic.name);
  name.append(
    element("br"),
    element("span", clinic.englishName, { lang: "en" }),
  );
  const social = element("div", null, { class: "social-icons" });
  for (const s of clinic.socialLinks.filter((s) =>
    ["LINE", "Instagram", "Facebook"].includes(s.label),
  )) {
    const a = link(null, s.href);
    a.setAttribute("aria-label", s.label + "（另開視窗）");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = s.label;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute(
      "href",
      "/visual-assets/social-icons.svg#" + s.label.toLowerCase(),
    );
    svg.append(use);
    a.append(svg);
    social.append(a);
  }
  brand.append(home, name, social);
  const care = element("nav", null, {
    class: "footer-care",
    "aria-label": "頁尾鼻功能照護",
  });
  care.append(element("h2", "鼻功能照護"));
  for (const [slug, title] of [
    ["snoring-five-in-one", "止鼾五合一"],
    ["inferior-turbinate-surgery", "下鼻甲手術"],
    ["septoplasty", "鼻中隔手術"],
    ["snore-relief-mouthguard", "止鼾好眠牙套"],
  ])
    care.append(link(title, "/clinic/nasal/" + slug));
  const contact = element("div", null, { class: "footer-contact" });
  contact.append(
    element("h2", "門診資訊"),
    element("p", clinic.address),
    link(clinic.phoneDisplay, clinic.phoneHref, "footer-phone"),
  );
  const hours = element("p");
  clinic.hours.forEach((text) => {
    const row = element("span", null, {class:"footer-hours"});
    const [days, time] = text.split(/\s+(?=\d)/);
    row.append(element("span",days));
    if(time)row.append(document.createTextNode(" "),element("span",time,{class:"hours-time"}));
    hours.append(row);
  });
  contact.append(hours, link("查看交通位置", "/clinic#visit"));
  main.append(brand, care, contact);
  const bottom = element("div", null, { class: "footer-bottom" });
  bottom.append(
    element("small", "© 2026 " + clinic.name + " Beau Essence Clinic"),
  );
  const nav = element("nav", null, { "aria-label": "頁尾網站資訊" });
  nav.append(
    link("醫師團隊", "/clinic/doctors"),
    link("隱私權說明", "/privacy"),
  );
  bottom.append(nav);
  root.replaceChildren(main, bottom);
}
installFooter(FOOTER_DATA);
