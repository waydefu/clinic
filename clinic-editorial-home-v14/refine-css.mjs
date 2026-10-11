import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('site.css', import.meta.url);
let css = await readFile(file, 'utf8');
css = css.replace('padding-top:326px;padding-bottom:32px', 'padding-top:326px;padding-bottom:88px');
css = css.replace("inset:38% 0 0;background:linear-gradient(to bottom,transparent 12%,rgb(247 248 241 / 68%) 68%,rgb(247 248 241 / 92%))", "inset:262px 0 0;background:linear-gradient(to bottom,transparent,rgb(247 248 241 / 92%) 64px,rgb(247 248 241 / 96%))");
css = css.replace('.hero-scene::after{inset:40% 0 0}', '.hero-scene::after{inset:190px 0 0}');
// Fold review corrections into their owning rules; retain one canonical stylesheet.
css = css.replace('.nasal-art{grid-column:', '.nasal-art{width:100%;grid-column:');
css = css.replace('z-index:-1;pointer-events:none}.team-heading', 'z-index:-1;pointer-events:none;mask-image:linear-gradient(to bottom,transparent,black 48%)}.team-heading');
css = css.replace('.doctor-copy h3{font-size:2.125rem}', '.doctor-copy h3{font-family:var(--sans);font-weight:700;font-size:2.125rem}');
css = css.replace('#social-links a{min-height:', '#social-links a{min-width:44px;min-height:');
css = css.replace('grid-template-columns:1.25fr 1fr;gap:4px 16px', 'grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr));gap:4px 16px');
css = css.replace('grid-column:1/-1;display:flex;align-items:center;gap:12px', 'grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap');
css = css.replace('.visit-strip a{display:inline-flex;', '.visit-strip a{overflow-wrap:anywhere;max-width:100%;display:inline-flex;');
css = css.replace('background-position:center bottom}.team-heading', 'background-position:center bottom;mask-image:linear-gradient(to bottom,transparent,black 55%)}.team-heading');
css = css.slice(0, css.indexOf('\n.nasal-art{width:100%}.team-field::before'));
await writeFile(file, css + '\n');
