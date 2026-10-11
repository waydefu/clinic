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
