import {readFile,writeFile} from 'node:fs/promises';
const f=new URL('site.css',import.meta.url);let s=await readFile(f,'utf8');s=s.replace('rgb(247 248 241 / 92%) 64px,rgb(247 248 241 / 96%)','rgb(247 248 241 / 68%) 64px,rgb(247 248 241 / 80%)');await writeFile(f,s);
