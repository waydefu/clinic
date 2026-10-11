import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
const root = new URL(".", import.meta.url);
const pageControllers = process.argv.includes("--home-only")
  ? ["site.js"]
  : ["site.js", "article.js"];
await mkdir(new URL("client-source/", root), { recursive: true });
for (const file of pageControllers) {
  const path = new URL("client-source/" + file, root);
  try {
    await access(path);
  } catch {
    await writeFile(path, await readFile(new URL(file, root)));
  }
}
const shared = await readFile(new URL("whole-image-reader.js", root), "utf8");
const repo =
  process.env.CLINIC_SOURCE_ROOT || "F:/診所專案/tmp/ui-check-refresh-20261005";
const { CLINIC } = await import(
  pathToFileURL(repo + "/apps/web/public/clinic-content.js")
);
const footer =
  "const FOOTER_DATA=" +
  JSON.stringify(CLINIC) +
  ";\n" +
  (await readFile(new URL("footer-client.js", root), "utf8"));
for (const file of pageControllers)
  await writeFile(
    new URL(file, root),
    (await readFile(new URL("client-source/" + file, root), "utf8")) +
      "\n" +
      shared +
      "\n" +
      footer,
  );
console.log(
  `Built ${pageControllers.length} page controller(s) from canonical sources and one shared whole-image reader.`,
);
