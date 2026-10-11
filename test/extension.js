const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const locales = Object.fromEntries(
  ["ru", "de"].map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(`extension/_locales/${locale}/messages.json`, "utf8"),
    ),
  ]),
);
function i18n(locale = "ru") {
  return {
    getMessage(key, substitution = "") {
      const entry = locales[locale][key];
      assert.ok(entry, `Missing translation: ${locale}/${key}`);
      return entry.message.replace(/\$(\w+)\$/g, (_, name) => {
        assert.strictEqual(entry.placeholders[name].content, "$1");
        return substitution;
      });
    },
  };
}
const event = { addListener() {} };
const log = { error() {}, debug() {} };
function run(context, file) {
  return vm.runInContext(
    fs.readFileSync(`extension/js/${file}`, "utf8"),
    context,
  );
}
function parser() {
  const dom = new JSDOM(
    '<script>var LIVESTREET_SECURITY_KEY="key";</script><article data-bid="123"></article>',
    { url: "https://akniga.org/first" },
  );
  const context = vm.createContext({
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    $: require("jquery")(dom.window),
    require,
    chrome: { i18n: i18n() },
    console: log,
  });
  run(context, "content/crypto-js.min.js");
  run(context, "content/parser.js");
  return { dom, context };
}

it("fetches a player token and decrypts the MP3 address", function () {
  const { dom, context } = parser();
  const url = "https://audio.example/book.mp3?res=test";
  context.url = url;
  const res = vm.runInContext(
    "CryptoJS.AES.encrypt(JSON.stringify(url), encryptionKey, { format: JsonFormatter }).toString()",
    context,
  );
  const responses = [
    { token: "token" },
    { res, items: '[{"file":1}]', titleonly: "Book" },
  ];
  const requests = [];
  context.$.ajax = (options) => {
    requests.push(options);
    return {
      done(callback) {
        callback(responses.shift());
        return this;
      },
      fail() {
        return this;
      },
    };
  };
  context.loadBookData(
    (book) => assert.strictEqual(book.files[0], url),
    (error) => {
      throw error;
    },
  );
  assert.ok(requests[0].url.endsWith("/player/token"));
  assert.strictEqual(requests[1].data.token, "token");
  assert.strictEqual(requests[1].data.hls, "false");
  assert.strictEqual(requests[1].data.security_ls_key, "key");
  dom.window.close();
});

it("updates the book on in-page navigation and ignores stale requests", function () {
  const { dom, context } = parser();
  const requests = [],
    messages = [];
  context.loadBookData = (success, error) => requests.push({ success, error });
  context.MutationObserver = dom.window.MutationObserver;
  context.setTimeout = () => {};
  context.chrome.runtime = {
    onMessage: event,
    sendMessage(message, callback) {
      messages.push(message);
      callback();
    },
  };
  run(context, "content/loader.js");
  dom.window.history.pushState({}, "", "/second");
  dom.window.document.querySelector("article").setAttribute("data-bid", "456");
  context.refreshPageState();
  requests[0].error(new Error("Old request"));
  requests[1].success({ id: "456", title: "Second" });
  assert.strictEqual(messages.at(-1).result.content.id, "456");
  assert.ok(messages.every((message) => !message.result.error));
  vm.runInContext("pageObserver.disconnect()", context);
  dom.window.close();
});

it("localizes the popup and keeps a shared browser manifest", async function () {
  assert.deepStrictEqual(
    Object.keys(locales.ru).sort(),
    Object.keys(locales.de).sort(),
  );
  const manifest = JSON.parse(
    fs.readFileSync("extension/manifest.json", "utf8"),
  );
  assert.deepStrictEqual(manifest.background.scripts, [
    manifest.background.service_worker,
  ]);
  for (const locale of ["ru", "de"]) {
    const dom = new JSDOM(fs.readFileSync("extension/popup.html", "utf8"));
    const context = vm.createContext({
      document: dom.window.document,
      chrome: {
        i18n: i18n(locale),
        tabs: { query: async () => [{ id: 7 }] },
        storage: { onChanged: event },
      },
    });
    await run(context, "popup.js");
    context.render({
      content: { title: "Book", image: "https://example.org/cover.jpg" },
    });
    assert.strictEqual(dom.window.document.documentElement.lang, locale);
    assert.strictEqual(
      dom.window.document.getElementById("download").textContent,
      locales[locale].buttonTitle.message,
    );
    assert.strictEqual(
      dom.window.document.getElementById("status").hidden,
      true,
    );
    assert.strictEqual(
      dom.window.document.getElementById("cover").alt,
      i18n(locale).getMessage("coverAlt", "Book"),
    );
    context.render({ error: i18n(locale).getMessage("downloadInterrupted") });
    assert.strictEqual(
      dom.window.document.getElementById("download").textContent,
      locales[locale].retry.message,
    );
    dom.window.close();
  }
});

it("downloads MP3s first, continues after cover errors and supports Firefox descriptions", async function () {
  for (const firefox of [false, true]) {
    let saved = {},
      id = 0;
    const downloads = [],
      blobs = [],
      revoked = [];
    const RuntimeURL = class extends URL {};
    RuntimeURL.createObjectURL = firefox
      ? (blob) => {
          blobs.push(blob);
          return `blob:test/${blobs.length}`;
        }
      : undefined;
    RuntimeURL.revokeObjectURL = (url) => revoked.push(url);
    const book = {
      id: "123",
      author: "Автор",
      title: "Книга",
      description: "Описание",
      metadata: [],
      image: "https://example.org/cover.jpg",
      files: ["https://example.org/book.mp3"],
    };
    const api = {
      i18n: i18n(),
      action: {
        setBadgeBackgroundColor: async () => {},
        setBadgeText: async () => {},
        setTitle: async () => {},
        setIcon: async () => {},
      },
      storage: {
        local: {
          get: async () => saved,
          set: async (value) => {
            saved = JSON.parse(JSON.stringify(value));
          },
        },
      },
      tabs: {
        sendMessage: async () => ({ content: book }),
        onRemoved: event,
        onUpdated: event,
      },
      downloads: {
        onChanged: event,
        search: async (query) => (query.id ? [{ state: "complete" }] : []),
        download: async (options) => {
          downloads.push(options);
          if (options.filename.endsWith("cover.jpg"))
            throw new Error("USER_CANCELED");
          assert.ok(!firefox || !options.url.startsWith("data:"));
          return ++id;
        },
      },
      alarms: { create: async () => {}, clear: async () => {}, onAlarm: event },
      runtime: { onMessage: event, onStartup: event },
    };
    const context = vm.createContext({
      chrome: api,
      URL: RuntimeURL,
      Blob: firefox ? Blob : undefined,
      console: log,
      setTimeout() {},
    });
    run(context, "background.js");
    await context.handleMessage({ type: "download", tabId: 7 }, {});
    for (let i = 0; i < 100; i++) await Promise.resolve();
    await context.watchQueuedItems();
    assert.ok(downloads[0].filename.endsWith(".mp3"));
    assert.strictEqual(downloads.length, 4);
    assert.ok(downloads.every((options) => options.saveAs === false));
    assert.strictEqual(saved.states[7].pending, 0);
    assert.ok(saved.states[7].error.includes("cover.jpg (USER_CANCELED)"));
    if (firefox) {
      assert.ok((await blobs[0].text()).includes(book.description));
      assert.strictEqual(JSON.parse(await blobs[1].text()).title, book.title);
      assert.strictEqual(revoked.length, 2);
    }
  }
});
