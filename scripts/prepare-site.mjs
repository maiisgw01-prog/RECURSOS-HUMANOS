import { cpSync, mkdirSync } from "node:fs";

const output = new URL("../public/", import.meta.url);
mkdirSync(output, { recursive: true });

for (const entry of ["index.html", "css", "js", "assets"]) {
  cpSync(new URL(`../${entry}`, import.meta.url), new URL(`../public/${entry}`, import.meta.url), {
    recursive: true
  });
}
