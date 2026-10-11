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
const directionalPaths = {
  forward: "M4 12h16m-6-6 6 6-6 6",
  down: "M12 4v16m-6-6 6 6 6-6",
  external: "M5 19 19 5M7 5h12v12",
  enlarge: "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5",
  phone: "M5 3h4l1 5-3 2a15 15 0 0 0 7 7l2-3 5 1v4c-8 3-19-8-16-16Z",
  play: "m9 5 10 7-10 7Z",
  pause: "M8 5v14M16 5v14",
  menu: "M4 8h16M4 16h16",
  close: "m6 6 12 12M18 6 6 18",
};
function actionIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24", width: "24", height: "24", fill: "none",
    "aria-hidden": "true", focusable: "false", class: "action-icon",
  })) svg.setAttribute(name, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", directionalPaths[kind]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.65");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}
function enhanceActions() {
  for (const action of document.querySelectorAll(".text-link,.booking-link,.care-action,.phone-link,.visit-strip a,.footer-care a,.footer-contact > a:last-child")) {
    const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT);
    const labels = [];
    while (walker.nextNode()) labels.push(walker.currentNode);
    for (const label of labels) label.textContent = label.textContent.replace(/\s*[↗↘→]\s*$/u, "");
    const href = action.getAttribute("href") || "";
    const destination = new URL(href, location.href);
    const kind = action.hasAttribute("data-image-open") ? "enlarge"
      : href.startsWith("tel:") ? "phone"
      : action.target === "_blank" ? "external"
      : destination.origin === location.origin && destination.pathname === location.pathname && destination.hash ? "down" : "forward";
    let holder = action.querySelector(":scope > span[aria-hidden='true']");
    if (!holder) {
      holder = node("span", null, { "aria-hidden": "true", class: "action-mark" });
      action.append(holder);
    }
    holder.replaceChildren(actionIcon(kind));
  }
}
document.addEventListener("DOMContentLoaded", enhanceActions, { once: true });
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
  const identity = node("div", null, { class: "doctor-identity" });
  identity.append(
    node("p", i ? "麻醉科" : "耳鼻喉科", { class: "doctor-specialty" }),
  );
  const heading = node("h3", name);
  heading.append(node("span", position));
  identity.append(heading);
  copy.append(identity);
  const summary = data.doctorSummaries.find(
    (item) => item.slug === doctor.slug,
  );
  copy.append(node("p", summary.focus, { class: "doctor-focus" }));
  copy.append(node("p", summary.summary));
  copy.append(
    node("a", "醫師介紹 ↗", {
      href: "/clinic/doctors/" + doctor.slug,
      class: "text-link",
      "aria-label": doctor.name + "的醫師介紹",
    }),
  );
  profile.append(copy);
  document.querySelector("#doctor-profiles").append(profile);
}
const careProcess = document.querySelector("#care-process");
careProcess.append(node("h3", "看診時會談些什麼", { class: "process-heading" }));
for (const feature of data.process) {
  const entry = node("div", null, { class: "process-entry" });
  const copy = node("div");
  copy.append(
    node("h4", feature.title),
    node("p", feature.description),
  );
  entry.append(copy);
  careProcess.append(entry);
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
const menuSummary = mobileMenu.querySelector("summary");
const menuMark = node("span", null, { "aria-hidden": "true" });
menuMark.append(actionIcon("menu"));
menuSummary.append(menuMark);
const careShortcuts = node("div", null, { class: "nav-care-links" });
for (const care of document.querySelectorAll(".care-action"))
  careShortcuts.append(node("a", care.querySelector("h3").textContent.trim(), { href: care.getAttribute("href") }));
mobileMenu.querySelector("a[href='#care']").after(careShortcuts);
let menuAnimation;
mobileMenu.addEventListener("toggle", () => {
  menuAnimation?.cancel();
  menuMark.replaceChildren(actionIcon(mobileMenu.open ? "close" : "menu"));
  if (mobileMenu.open && !reduced.matches)
    menuAnimation = mobileMenu.querySelector("nav").animate(
      [{ opacity: .5, transform: "translateY(-6px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(.22,.61,.36,1)" },
    );
});
document.addEventListener("pointerdown", (event) => {
  if (mobileMenu.open && !mobileMenu.contains(event.target)) mobileMenu.open = false;
});
mobileMenu.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    mobileMenu.open = false;
  }),
);
mobileMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mobileMenu.open = false;
    menuSummary.focus();
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
const photoTransitions = new Map();
function settlePhoto(image) {
  const transition = photoTransitions.get(image);
  if (!transition) return;
  photoTransitions.delete(image);
  transition.animation.cancel();
  transition.previous.remove();
}
function commitPhoto(image, photo) {
  settlePhoto(image);
  const previous = image.cloneNode(false);
  previous.removeAttribute("id");
  previous.className = "photo-previous";
  previous.alt = "";
  previous.setAttribute("aria-hidden", "true");
  image.before(previous);
  image.src = photo.url;
  image.dataset.photo = photo.id;
  if (reduced.matches || document.hidden) {
    previous.remove();
    return;
  }
  // The old image stays opaque behind the new layer. The frame never fades
  // through paper, so the brand photo retains its tone throughout the dissolve.
  const animation = image.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 560,
    easing: "cubic-bezier(.22,.61,.36,1)",
  });
  photoTransitions.set(image, { animation, previous });
  animation.finished.then(() => {
    if (photoTransitions.get(image)?.animation === animation) settlePhoto(image);
  }).catch((error) => {
    if (error.name !== "AbortError") console.error("Photo transition failed.");
  });
}
function syncPlayback() {
  clearTimeout(timer);
  if (reduced.matches) {
    paused = true;
    settlePhoto(heroPhoto);
    settlePhoto(document.querySelector("#environment-photo"));
  }
  play.hidden = reduced.matches;
  play.setAttribute("aria-label", paused ? "播放輪播" : "暫停輪播");
  play.replaceChildren(actionIcon(paused ? "play" : "pause"));
  hero.dataset.playback = reduced.matches
    ? "manual-only"
    : paused
      ? "paused"
      : document.hidden
        ? "hidden"
        : "playing";
  if (!reduced.matches && !paused && !document.hidden)
    timer = setTimeout(async () => {
      if (reduced.matches || document.hidden) {
        syncPlayback();
        return;
      }
      await showPhoto((current + 1) % data.photos.length, false);
      syncPlayback();
    }, 7000);
}
function pauseRotation() {
  paused = true;
  generation++;
  settlePhoto(heroPhoto);
  syncPlayback();
}
hero.addEventListener("mouseenter", pauseRotation);
hero.addEventListener("focusin", (event) => {
  if (event.target !== play) pauseRotation();
});
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
  commitPhoto(heroPhoto, photo);
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
  // A media change can race this asynchronous decode/commit. Re-read the
  // current preference even if its change notification has not run yet.
  syncPlayback();
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
  menuAnimation?.cancel();
  paused = true;
  generation++;
  settlePhoto(heroPhoto);
  settlePhoto(document.querySelector("#environment-photo"));
  if (reduced.matches && document.activeElement === play)
    document.querySelector('[data-photo-index="' + current + '"]').focus();
  syncPlayback();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    generation++;
    settlePhoto(heroPhoto);
    settlePhoto(document.querySelector("#environment-photo"));
  }
  syncPlayback();
});
window.addEventListener("pagehide", () => {
  menuAnimation?.cancel();
  generation++;
  environmentGeneration++;
  clearTimeout(timer);
  settlePhoto(heroPhoto);
  settlePhoto(document.querySelector("#environment-photo"));
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
    "aria-pressed": id === "lounge",
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
    commitPhoto(image, photo);
    image.alt = "一森渼診所" + labels[id];
    if (reduced.matches) syncPlayback();
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
