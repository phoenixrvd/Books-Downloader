import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  headless: false,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const url = "https://akniga.org/shekli-robert-absolyutnoe-oruzhie";
const desktop = await browser.newPage();
await desktop.goto(url);
const mobile = await browser.newPage();
await mobile.emulate(puppeteer.knownDevices["iPhone X"]);
await mobile.goto(url);
