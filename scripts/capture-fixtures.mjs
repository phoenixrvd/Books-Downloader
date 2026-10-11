import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const cache = new URL("../test/cache/", import.meta.url);
await mkdir(cache, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
});
try {
  for (const layout of ["desktop", "mobile"]) {
    const page = await browser.newPage();
    try {
      if (layout === "mobile")
        await page.emulate(puppeteer.knownDevices["iPhone X"]);
      await page.goto("https://akniga.org/shekli-robert-absolyutnoe-oruzhie");
      const html = await page.evaluate(() => {
        const fixture = document.implementation.createHTMLDocument("Fixture");
        if (document.querySelector(".layout--template-acl10-mobile"))
          fixture.body.className = "layout--template-acl10-mobile";
        const article = fixture.createElement("article");
        const id = document.querySelector("article")?.getAttribute("data-bid");
        if (id !== null && id !== undefined)
          article.setAttribute("data-bid", id);
        fixture.body.append(article);
        // Copy only book data, never account UI or inline session configuration.
        for (const node of document.querySelectorAll(
          "article .book--cover, article .description__article-main, .caption__article--about-block, article .classifiers__article-main, .topic-content, .book-info",
        )) {
          const copy = node.cloneNode(true);
          article.append(copy);
        }
        fixture
          .querySelectorAll(
            "script, style, link, iframe, .ya-share2, .topic-content-right",
          )
          .forEach((node) => node.remove());
        return "<!doctype html>\n" + fixture.documentElement.outerHTML;
      });
      await writeFile(new URL(`${layout}.html`, cache), html);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
