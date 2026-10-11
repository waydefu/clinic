// One-time migration to a readable homepage template and a single shared footer.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url);
let html=await readFile(new URL('index.html',root),'utf8');
html=html.replace(/<article(?: class="mouthguard-entry")?>[\s\S]*?<\/article>/g,block=>{
  const href=block.match(/href="([^"]+)"/)[1];
  const title=block.match(/<h3>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a\s*>[\s\S]*?<\/h3\s*>/)[1].trim();
  const copy=block.match(/<p>([\s\S]*?)<\/p>/)[1].trim();
  return `<article><a class="care-action" href="${href}"><div><h3>${title}</h3><p>${copy}</p></div><span class="action-arrow" aria-hidden="true">↗</span></a></article>`;
});
const visitStart=html.indexOf('        <div class="visit-content">');
const visitEnd=html.indexOf('      </section>',visitStart);
if(visitStart<0||visitEnd<0)throw Error('Visit boundary absent');
html=html.slice(0,visitStart)+`        <div class="visit-content">
          <figure class="arrival-map"><img src="/visual-assets/clinic-map.svg" width="1200" height="800" alt="一森渼診所位於光復北路112號2樓的交通位置示意圖" loading="lazy"><figcaption><span>交通位置示意 · © OpenStreetMap contributors</span><a id="map-link" class="text-link" target="_blank" rel="noopener noreferrer">路線導航 <span aria-hidden="true">↗</span></a></figcaption></figure>
          <div class="visit-info">
            <div class="visit-location"><h3>診所位置</h3><p id="visit-address"></p></div>
            <div><h3>門診時間</h3><ul id="visit-hours"></ul><p class="muted">週一、週二、週日休診</p></div>
            <div class="visit-contact"><a href="/booking" class="booking-link">預約門診 <span aria-hidden="true">↗</span></a><a id="visit-phone" class="phone-link"></a><!-- visit-social --></div>
          </div>
        </div>
`+html.slice(visitEnd);
html=html.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/,'<!-- shared-footer -->');
await writeFile(new URL('index.source.html',root),html);
let build=await readFile(new URL('build-pages.mjs',root),'utf8');
build="import { footer as renderFooter, socials } from './shell.mjs';\n"+build;
build=build.replace('const home = await readFile(new URL("index.html", root), "utf8");',`const template = await readFile(new URL("index.source.html", root), "utf8");
const footer = renderFooter(canon.CLINIC);
const home = template.replace('<!-- shared-footer -->',footer).replace('<!-- visit-social -->',socials(canon.CLINIC,'social-links'));
// Generated HTML omits formatting whitespace, retaining all native content and semantics.
await writeFile(new URL('index.html',root),home.replace(/>\\s+</g,'><').trim());`);
build=build.replace(/^const footer = `<footer[^\n]+;\r?\n/m,'');
await writeFile(new URL('build-pages.mjs',root),build);
let client=await readFile(new URL('client-source/site.js',root),'utf8');
client=client.replace('for (const id of ["quick-address", "visit-address", "footer-address"])','for (const id of ["quick-address", "visit-address"])');
const a=client.indexOf('for (const social of clinic.socialLinks.filter(');
const b=client.indexOf('for (let i = 0; i < data.doctors.length;',a);
if(a<0||b<0)throw Error('Social boundary absent');
client=client.slice(0,a)+client.slice(b);
client=client.replace('node("a", "學經歷與照護項目 ↗", {','node("a", "醫師介紹 ↗", {');
client=client.replace('target: "_blank",\n        rel: "noopener noreferrer",\n      }),','target: "_blank",\n        rel: "noopener noreferrer",\n        class: "text-link",\n      }),');
await writeFile(new URL('client-source/site.js',root),client);
console.log('Homepage template and shared footer migrated.');
