import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = new URL("../dist/", import.meta.url);
const watch = process.argv.includes("--watch");
await rm(dist, { recursive: true, force: true });
await mkdir(new URL("js/", dist), { recursive: true });

for (const asset of ["popup.css", "img", "_locales"]) {
  await cp(
    new URL(`../src/extension/${asset}`, import.meta.url),
    new URL(asset, dist),
    {
      recursive: true,
    },
  );
}

const manifest = JSON.parse(
  await readFile(
    new URL("../src/extension/manifest.json", import.meta.url),
    "utf8",
  ),
);
await writeFile(
  new URL("manifest.json", dist),
  JSON.stringify(manifest, null, 2) + "\n",
);
const html = await readFile(
  new URL("../src/extension/popup.html", import.meta.url),
  "utf8",
);
await writeFile(new URL("popup.html", dist), html);

const options = {
  absWorkingDir: root,
  bundle: true,
  minify: !watch,
  format: "iife",
  platform: "browser",
  target: ["chrome121", "firefox121"],
  legalComments: "eof",
};

const bundle = {
  ...options,
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts"],
  outdir: "dist/js",
};
if (watch) {
  const builder = await context(bundle);
  await builder.watch();
} else {
  await build(bundle);
}
await cp(
  new URL("../node_modules/crypto-js/LICENSE", import.meta.url),
  new URL("LICENSE.crypto-js", dist),
);
