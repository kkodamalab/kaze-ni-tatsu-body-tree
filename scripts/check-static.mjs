// Static deployment has no bundler; validate every local dependency and syntax.
import { readFile, readdir, access } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve(new URL("..", import.meta.url).pathname);
let checked = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name.startsWith(".") || item.name === "tests") continue;
    const path = resolve(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/\.(js|mjs)$/.test(path)) {
      execFileSync(process.execPath, ["--check", path]);
      const text = await readFile(path, "utf8");
      for (const match of text.matchAll(
        /(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']/g,
      )) {
        const dependency = resolve(dirname(path), match[1]);
        if (!dependency.startsWith(root + "/"))
          throw Error("Import escapes deployment: " + relative(root, path));
        await access(dependency);
      }
      checked++;
    }
  }
}
await walk(root);
const html = await readFile(resolve(root, "index.html"), "utf8");
for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!m[1].includes("://")) await access(resolve(root, m[1]));
}
console.log(
  `PASS: static deployment graph and syntax (${checked} JS modules); no compilation required`,
);
