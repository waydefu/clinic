import {chromium} from 'file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const out='F:/診所專案/output/playwright/clinic-editorial-home-20261006/round2-final';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const rows=[];
const routes=['','/doctors','/nasal/snoring-five-in-one','/nasal/inferior-turbinate-surgery','/nasal/septoplasty','/nasal/snore-relief-mouthguard'];
for(const route of routes)for(const width of [375,1440]){
 const page=await browser.newPage({viewport:{width,height:width===375?812:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3216/clinic'+route,{waitUntil:'networkidle'});
 const footer=page.locator('.site-footer');await footer.scrollIntoViewIfNeeded();
 assert.equal(await footer.locator('nav[aria-label="頁尾鼻功能照護"] a').count(),4);
 for(const [name,url] of [['LINE','https://page.line.me/821tzbtx'],['Instagram','https://www.instagram.com/beauessence.tw'],['Facebook','https://www.facebook.com/beauessencetaipei/']]){
   const a=footer.getByRole('link',{name:name+'（另開視窗）',exact:true});assert.equal(await a.getAttribute('href'),url);assert.equal(await a.locator('svg use').count(),1);
 }
 for(const scaled of [false,true]){
  if(scaled)await page.evaluate(()=>{document.documentElement.style.fontSize='32px';});
  const geometry=await footer.locator('.hours-time').evaluateAll(elements=>elements.map(e=>{const range=document.createRange();range.selectNodeContents(e);const r=e.getBoundingClientRect();return{text:e.textContent,lines:range.getClientRects().length,left:r.left,right:r.right};}));
  assert.ok(geometry.every(r=>r.lines===1&&r.left>=0&&r.right<=width));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(width===375&&route==='')await footer.screenshot({path:out+'/footer-375'+(scaled?'-text200':'')+'.png'});
  rows.push({route:'/clinic'+route,width,textScale:scaled?200:100,clockRanges:geometry,overflow:false});
 }
 await footer.getByRole('link',{name:'LINE（另開視窗）',exact:true}).focus();assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true);
 assert.deepEqual(errors,[]);await page.close();
}
const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});await page.goto('http://127.0.0.1:3216/clinic',{waitUntil:'networkidle'});
const trigger=page.locator('.arrival-map [data-image-open]');await trigger.click();assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);await page.getByRole('button',{name:'放大圖片'}).click();assert.equal(await page.locator('.reader-tools output').textContent(),'150%');await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
const svg=await page.request.get('http://127.0.0.1:3216/visual-assets/clinic-map.svg',{headers:{'Accept-Encoding':'gzip'}});assert.equal(svg.status(),200);assert.equal(svg.headers()['content-encoding'],'gzip');
await page.close();await browser.close();
const manifest=JSON.parse(await readFile('asset-manifest.json'));const resourceFiles=[...manifest.records.map(r=>r.output),'index.html','home-site.css','site.js','home-data.js'];
const total= (await Promise.all(resourceFiles.map(async f=>gzipSync(await readFile(f)).length))).reduce((a,b)=>a+b,0);assert.ok(total<=200*1024);
await writeFile(out+'/round2-checks.json',JSON.stringify({scope:'Prototype only; focused final shared-footer revision, not formal build/CI',rows,mapReader:{keyboard:true,escapeFocusReturn:true,zoom:'150%'},svgGzip:true,fullClosureBytes:total,imageResources:manifest.imageCount,status:'PASS'},null,2));console.log(JSON.stringify({status:'PASS',routeViewportScaleViews:rows.length,mapReader:'PASS',totalKiB:total/1024,imageResources:manifest.imageCount}));
