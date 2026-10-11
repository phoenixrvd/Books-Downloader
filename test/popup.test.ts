import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { BrowserApi } from "../src/browser-api";

it("offers Android download links in new tabs without using the download queue", async () => {
  const dom = new JSDOM(readFileSync("src/extension/popup.html", "utf8"));
  let closed = false;
  const opened: unknown[] = [];
  const globals = globalThis as unknown as {
    document?: Document;
    browser?: BrowserApi;
    window?: { close: () => void };
  };
  const previous = {
    document: globals.document,
    browser: globals.browser,
    window: globals.window,
  };
  globals.document = dom.window.document;
  globals.window = {
    close: () => {
      closed = true;
    },
  };
  globals.browser = {
    i18n: { getMessage: (key: string, file?: string) => file || key },
    runtime: {
      getPlatformInfo: async () => ({ os: "android" }),
      sendMessage: async () => {
        throw new Error("Android must not use the queue");
      },
    },
    tabs: {
      create: async (options: unknown) => {
        assert.equal(closed, false);
        opened.push(options);
      },
      query: async () => [{ id: 7, url: "https://akniga.org/book" }],
      sendMessage: async () => ({
        content: {
          id: "123",
          title: "Book",
          author: "Author",
          description: "Do not display this description",
          metadata: [
            "Автор: Author",
            "Исполнитель: Narrator",
            "Длительность: 2 часа",
          ],
          metadataFields: [
            { label: "Автор", value: "Author" },
            { label: "Исполнитель", value: "Narrator" },
            { label: "Длительность", value: "2 часа" },
          ],
          files: [
            "https://audio.example/01.mp3",
            "https://audio.example/02.%20%D0%9A%D0%BD%D0%B8%D0%B3%D0%B0.mp3",
          ],
        },
      }),
    },
    storage: { onChanged: { addListener() {} } },
  } as unknown as BrowserApi;
  try {
    await import("../src/popup");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(dom.window.document.getElementById("download")!.hidden, true);
    assert.equal(dom.window.document.querySelector("h1")!.textContent, "Book");
    assert.deepEqual(
      Array.from(
        dom.window.document.querySelectorAll("#metadata dt"),
        (node) => node.textContent,
      ),
      ["Автор", "Исполнитель", "Длительность"],
    );
    assert.deepEqual(
      Array.from(
        dom.window.document.querySelectorAll("#metadata dd"),
        (node) => node.textContent,
      ),
      ["Author", "Narrator", "2 часа"],
    );
    assert.ok(
      !dom.window.document.body.textContent!.includes(
        "Do not display this description",
      ),
    );
    assert.equal(
      dom.window.document.documentElement.classList.contains("mobile"),
      true,
    );
    const links =
      dom.window.document.querySelectorAll<HTMLAnchorElement>("#files a");
    assert.equal(links.length, 2);
    assert.equal(links[0].textContent, "01.mp3");
    assert.equal(links[1].textContent, "02. Книга.mp3");
    assert.equal(links[0].href, "https://audio.example/01.mp3");
    assert.equal(links[0].download, "01.mp3");
    assert.equal(links[0].target, "_blank");
    links[0].click();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(opened, [
      { url: "https://audio.example/01.mp3", active: true },
    ]);
    assert.equal(closed, true);
  } finally {
    globals.document = previous.document;
    globals.browser = previous.browser;
    globals.window = previous.window;
    dom.window.close();
  }
});
