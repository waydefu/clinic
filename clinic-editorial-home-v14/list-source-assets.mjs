import {readFile} from 'node:fs/promises';const m=JSON.parse(await readFile('F:/診所專案/tmp/official-site-images-2026-10-05/manifest.json','utf8'));console.log(m.files.map(r=>r.file).join('\n'));
