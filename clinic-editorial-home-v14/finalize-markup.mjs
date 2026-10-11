import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('index.html',import.meta.url);let html=await readFile(file,'utf8');
const old='<figcaption id="environment-caption">看診空間</figcaption><div id="environment-selectors" class="environment-selectors" role="group" aria-label="選擇環境照片"></div></figure>';
const replacement='<figcaption id="environment-caption">看診空間</figcaption></figure><div id="environment-selectors" class="environment-selectors" role="group" aria-label="選擇環境照片"></div><p id="environment-error" class="photo-error" hidden></p></div>';
if(!html.includes(old))throw Error('Environment markup changed; refuse blind rewrite');
html=html.replace('<div class="environment-spread"><figure','<div class="environment-spread"><div class="environment-gallery"><figure').replace(old,replacement);
html=html.replace('<aside class="visit-strip"','<p id="hero-error" class="photo-error page-width" hidden></p><aside class="visit-strip"');
html=html.replaceAll('重畫的成人睡眠情境插畫','成人睡眠情境插畫').replaceAll('原官網止鼾牙套構造線稿','止鼾牙套構造線稿');
await writeFile(file,html);
