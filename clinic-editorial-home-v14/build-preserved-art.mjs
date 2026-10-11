import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('<HOME>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=new URL('.',import.meta.url);
const archive=process.env.CLINIC_ASSET_ARCHIVE||'F:/診所專案/tmp/official-site-images-2026-10-05';
const sourceManifest=JSON.parse(await readFile(archive+'/manifest.json','utf8'));
const config=JSON.parse(await readFile(new URL('preserved-art.json',root),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const records=[];
await mkdir(new URL('assets/whole/',root),{recursive:true});
for(const job of config.jobs){
 const bytes=await readFile(archive+'/'+job.file);const original=sourceManifest.files.find(r=>r.file===job.file);if(!original||hash(bytes)!==original.sha256)throw Error('Original mismatch: '+job.file);
 const originalMeta=await sharp(bytes).metadata();let encoded,quality;
 for(const q of [86,80,74,68,62,56]){encoded=await sharp(bytes).resize({width:job.width,withoutEnlargement:true}).webp({quality:q,alphaQuality:90,effort:6}).toBuffer();quality=q;if(encoded.length<=job.capKiB*1024)break;}
 const meta=await sharp(encoded).metadata();const output='assets/whole/'+job.name+'.webp';await writeFile(new URL(output,root),encoded);
 records.push({...job,output,bytes:encoded.length,width:meta.width,height:meta.height,quality,sha256:hash(encoded),source:archive+'/'+job.file,sourceUrl:original.url,sourceSha256:original.sha256,originalWidth:originalMeta.width,originalHeight:originalMeta.height,operation:'resize-whole-only',crop:null,review:'All embedded medical claims and comparisons pending clinic review; original composition preserved'});
}
await writeFile(new URL('whole-art.manifest.json',root),JSON.stringify({authority:config.authority,rule:config.rule,records},null,2));
console.log(JSON.stringify(records.map(r=>({name:r.name,KiB:r.bytes/1024,width:r.width,height:r.height})),null,2));
