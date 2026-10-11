import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'file:///F:/診所專案/cal-pilot/.claude/worktrees/shots/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';
const root=new URL('.',import.meta.url);const manifest=JSON.parse(await readFile(new URL('whole-art.manifest.json',root),'utf8'));
const out='F:/診所專案/output/playwright/clinic-editorial-home-20261006/whole-art-proof';await mkdir(out,{recursive:true});
const result={scope:'Owner-preserved full artwork and local image reader',originals:[],views:[]};
for(const record of manifest.records){const hash=createHash('sha256').update(await readFile(record.source)).digest('hex');assert.equal(hash,record.sourceSha256);assert.equal(record.crop,null);assert.equal(record.operation,'resize-whole-only');assert.ok(Math.abs(record.height-record.width*record.originalHeight/record.originalWidth)<=1);result.originals.push({name:record.name,sourceUnchanged:true,original:[record.originalWidth,record.originalHeight],served:[record.width,record.height],crop:null});}
const browser=await chromium.launch();
for(const width of [1440,375])for(const route of ['/clinic','/clinic/nasal/snoring-five-in-one','/clinic/nasal/inferior-turbinate-surgery','/clinic/nasal/septoplasty','/clinic/nasal/snore-relief-mouthguard']){
 const page=await browser.newPage({viewport:{width,height:width===375?812:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3216'+route,{waitUntil:'networkidle'});
 const figures=page.locator('figure.whole-art');
 for(let i=0;i<await figures.count();i++){
  const figure=figures.nth(i);await figure.scrollIntoViewIfNeeded();const image=figure.locator('img');await image.evaluate(img=>img.decode());
  const geometry=await image.evaluate(img=>{const s=getComputedStyle(img),b=img.getBoundingClientRect();return {src:img.currentSrc,width:b.width,height:b.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,fit:s.objectFit,clip:s.clipPath,mask:s.maskImage};});
  assert.equal(geometry.fit,'contain');assert.equal(geometry.clip,'none');assert.equal(geometry.mask,'none');assert.ok(Math.abs(geometry.height-geometry.width*geometry.naturalHeight/geometry.naturalWidth)<1);
  const name=geometry.src.split('/').at(-1).replace('.webp','');const button=figure.locator('[data-image-open]');await button.click();const dialog=page.locator('.image-reader');assert.equal(await dialog.isVisible(),true);
  await dialog.locator('.reader-image').evaluate(img=>img.decode());assert.equal(await dialog.locator('.reader-image').getAttribute('src'),geometry.src);
  await dialog.getByRole('button',{name:'放大圖片',exact:true}).click();assert.equal(await dialog.locator('output').textContent(),'150%');
  const zoom=await dialog.locator('.reader-image').evaluate(img=>{const b=img.getBoundingClientRect();return {width:b.width,height:b.height};});assert.ok(Math.abs(zoom.height-zoom.width*geometry.naturalHeight/geometry.naturalWidth)<1);
  if(i===0)await page.screenshot({path:out+'/'+route.split('/').at(-1)+'-'+width+'-reader.png'});
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await button.evaluate(e=>e===document.activeElement),true);
  if(route==='/clinic')assert.equal(await page.locator('.hero-scene').getAttribute('data-playback'),'manual-only');
  result.views.push({route,width,name,geometry,zoom,escapeRestoresFocus:true});
 }
 assert.deepEqual(errors,[]);await page.close();
}
await browser.close();await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({originals:result.originals.length,views:result.views.length,preservation:'PASS',reader:'PASS'}));
