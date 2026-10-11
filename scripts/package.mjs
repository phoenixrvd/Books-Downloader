import { readdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";

// Package the existing dist directory as-is.
const dist = new URL("../dist/", import.meta.url);
const files = {};
async function collect(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      await collect(new URL(entry.name + "/", directory), name + "/");
    } else {
      files[name] = new Uint8Array(
        await readFile(new URL(entry.name, directory)),
      );
    }
  }
}
await collect(dist);
await writeFile(
  new URL("../audioknigi_donloader.zip", import.meta.url),
  zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) }),
);
console.log("Created audioknigi_donloader.zip");
