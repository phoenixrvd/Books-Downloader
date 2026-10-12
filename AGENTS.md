# Repository guidance

## Commands and build gotchas

- Use Node 22 (`.nvmrc`) and `npm ci`.
- CI verification order: `npm run format:check` → `npm run typecheck` →
  `npm test` → `npm run build` → `npm run dist:zip`.
  Typecheck covers both source and tests; esbuild does not typecheck.
- Tests run offline against TypeScript source, not `dist/`. From the repo root,
  run one file with `npx mocha --import=tsx test/recovery.test.ts`; add
  `--grep "reconciles saved completions"` to select a test.
- Both `build` and `watch` delete and recreate `dist/` on startup.
  Watch rebuilds JS only: restart it after changing the manifest, popup HTML/CSS,
  images, or locales under `src/extension/`.
- `npm run dist:zip` packages existing `dist/` as-is; build first.
  Load `dist/` as the unpacked extension. `dist/` and the ZIP are ignored outputs.
- `npm run dist:sandbox` uses existing `dist/` and opens live desktop/mobile
  pages in headed Chromium. It and `npm run fixtures:capture` require an installed
  browser (`CHROME_PATH`, default `/usr/bin/chromium`) and network access.
- Fixture capture writes sanitized candidates to ignored `test/cache/`, not
  `test/fixtures/`; review them before replacing committed fixtures. Do not add
  account UI or inline session configuration to fixtures.

## Runtime constraints

- One MV3 package serves Chrome and Firefox. Preserve both `service_worker`
  and `scripts` in `src/extension/manifest.json`; use `src/browser-api.ts`
  for the Firefox `browser` / Chrome `chrome` API selection.
- `src/content.ts` parses the current page and fetches book data in the page's
  same-origin cookie context (`book-api.ts`). Security keys are read from script
  text without executing it. PJAX navigation can change books without reloading;
  preserve abort/generation checks that reject stale responses.
- Desktop popup commands go through `Background` and `DownloadQueue`.
  Queue, active downloads, and tab states persist in `storage.local`; MV3 event
  listeners must register before async restoration finishes, and reconciliation
  runs on worker initialization, not just `onStartup`. Recovery tests cover this.
- On Android, `src/popup.ts` reads the content script directly and opens HTTP
  file links in new tabs; it deliberately bypasses the background download queue.
- Release version comes from `src/extension/manifest.json`, not `package.json`.
  Manifest versions always have three numeric components (`<major>.<minor>.1`);
  the third component is always `1` (for example, branch `v2.3` corresponds to
  manifest version `2.3.1`).
  The release workflow publishes `v<version>` from `master` and skips publication
  if that release already exists.
