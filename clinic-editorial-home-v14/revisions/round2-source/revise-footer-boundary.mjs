import {readFile,writeFile} from 'node:fs/promises';
let s=await readFile('shell.mjs','utf8');
s=s.slice(0,s.indexOf('export function footer'))+`export function footer(clinic) {
 return \`<footer class="site-footer"><div class="page-width"><div><strong>一森渼診所</strong><span lang="en">Beau Essence Clinic</span></div><p>\${escape(clinic.address)}</p><a href="\${escape(clinic.phoneHref)}">\${escape(clinic.phoneDisplay)}</a><a href="/privacy">隱私權說明</a></div></footer>\`;
}\n`;
await writeFile('shell.mjs',s);
let b=await readFile('build-client.mjs','utf8');
b="import {pathToFileURL} from 'node:url';\n"+b;
b=b.replace("const shared=await readFile(new URL('whole-image-reader.js',root),'utf8');",`const shared=await readFile(new URL('whole-image-reader.js',root),'utf8');
const repo=process.env.CLINIC_SOURCE_ROOT||'F:/診所專案/tmp/ui-check-refresh-20261005';
const {CLINIC}=await import(pathToFileURL(repo+'/apps/web/public/clinic-content.js'));
const footer='const FOOTER_DATA='+JSON.stringify(CLINIC)+';\\n'+await readFile(new URL('footer-client.js',root),'utf8');`);
b=b.replace("+'\\n'+shared);","+'\\n'+shared+'\\n'+footer);");
await writeFile('build-client.mjs',b);
