import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('.',import.meta.url);
const review=JSON.parse(await readFile(new URL('visual-review.json',root)));
review.secondReview={
 date:'2026-10-06',authority:'Owner requested second visual review and six refinements; then changed large deep-green surfaces to pale green',
 scope:'Local six-page prototype, homepage composition plus shared shell; no formal source integration or deployment',
 independentEvidence:'F:/診所專案/output/playwright/clinic-editorial-home-20261006/independent-review-round2-after/review.json',
 renderedEvidence:'F:/診所專案/output/playwright/clinic-editorial-home-20261006/round2-final/',
 decisions:[
  {route:'/clinic',viewport:1440,element:'h1',problem:'Centered at x420 below the physical sign; disconnected from the left editorial axis',change:'Move to x120 with the same lower photographic position; preserve the mobile x24 composition'},
  {route:'/clinic#care',viewport:[1440,375],element:'Care links',problem:'Repeated title link plus underlined reading link looked like a document index',change:'Single linked title/description with a 44px directional affordance; remove duplicate reading CTA'},
  {route:'/clinic',viewport:[1440,375],element:'Section surfaces',problem:'Repeated paper background weakened section rhythm',change:'Reuse owned mist/forest with pale-green care/team/footer and a warm environment passage; keep deep ink for reading'},
  {route:'/clinic#visit',viewport:[1440,375],element:'Arrival',problem:'Text-only directions with no geographic visual',change:'Source-verified full SVG diagram, zoom/keyboard reader and navigation; smartphone hours use full width'},
  {route:'Six primary clinic routes',viewport:[1440,375],element:'Footer',problem:'Minimal footer did not close the page or provide a complete site map',change:'Shared native footer: brand, care routes, public contacts/hours, official-color social symbols, privacy/copyright'},
  {route:'/clinic',viewport:375,element:'Footer hours',problem:'Independent follow-up identified a split time range',change:'Separate date/time spans, keep time together; allow a single footer column when text scales to 200%'}
 ],
 status:'Independent review findings resolved in tested scope; prototype checks and focused final revision checks passed. Owner/clinical approval and formal build/CI remain separate.'
};
await writeFile(new URL('visual-review.json',root),JSON.stringify(review,null,2));
console.log('Recorded second review, concrete changes and evidence boundaries.');
