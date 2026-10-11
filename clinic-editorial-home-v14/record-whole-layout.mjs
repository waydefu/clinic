import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url);const read=name=>readFile(new URL(name,root),'utf8').then(JSON.parse);
const whole=await read('whole-art.manifest.json');const use=await read('asset-use.json');
const routes={
 'whole-turbinate':['/clinic','/clinic/nasal/inferior-turbinate-surgery'],
 'whole-snoring-causes':['/clinic/nasal/snoring-five-in-one'],
 'whole-mouthguard':['/clinic/nasal/snore-relief-mouthguard'],
 'whole-instruments':['/clinic/nasal/inferior-turbinate-surgery'],
 'whole-comparison-wide':['/clinic/nasal/inferior-turbinate-surgery'],
 'whole-comparison-tall':['/clinic/nasal/inferior-turbinate-surgery'],
 'whole-septum-types':['/clinic/nasal/septoplasty']
};
const allocations=new Map(use.allocations.map(record=>[record.output,record]));
for(const record of whole.records)allocations.set(record.output,{...record,routes:routes[record.name],preservation:'Complete authored composition; whole-image resize only'});
use.allocations=[...allocations.values()];use.latestOwnerInstruction=whole.authority;
const sharedRoutes=['/clinic','/clinic/doctors','/clinic/nasal/snoring-five-in-one','/clinic/nasal/inferior-turbinate-surgery','/clinic/nasal/septoplasty','/clinic/nasal/snore-relief-mouthguard'];
for(const record of use.allocations)if(['assets/social-icons.svg','assets/logo.webp','assets/background-atlas.webp'].includes(record.output))record.routes=sharedRoutes;
use.reserved=use.reserved.filter(r=>!r.group.startsWith('Desktop/mobile baked'));
use.reserved.push({group:'Earlier cut anatomy/device/type/appliance derivatives',decision:'Retired outside served assets; superseded by protected whole graphics.'},{group:'Four small generic care symbols',decision:'Originals retained in the source library; homepage allocation prioritises the complete commissioned medical plate.'});
await writeFile(new URL('asset-use.json',root),JSON.stringify(use,null,2));
const ledger=await read('medical-content-ledger.json');ledger.protectedGraphicClaims=whole.records.map(r=>({name:r.name,source:r.source,sourceUrl:r.sourceUrl,sourceSha256:r.sourceSha256,scope:'All embedded text, medical statements, numeric comparisons, symbols and rankings',review:'Pending clinic medical review; retained as source artwork, no new medical signoff'}));
await writeFile(new URL('medical-content-ledger.json',root),JSON.stringify(ledger,null,2));
const review=await read('visual-review.json');review.ownerCorrection={date:'2026-10-06',instruction:whole.authority,change:'Complete source canvases restored; former diagram/device fragments retired; native full-image reader and readable HTML explanations added.',evidence:'whole-art-proof/results.json; preserved-v1/; preserved-home/',status:'Rendered preservation and reader checks passed; medical and human visual acceptance remain pending'};await writeFile(new URL('visual-review.json',root),JSON.stringify(review,null,2));
