const menu = document.querySelector(".mobile-navigation");
menu?.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    menu.open = false;
  }),
);
menu?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});
// Static, native medical content. No HTML injection, booking model or new controller.

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
