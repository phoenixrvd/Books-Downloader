import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Content } from "../src/content";
import { Background } from "../src/background";
import { DownloadQueue } from "../src/download-queue";
import { bookDownloads, replacePathChars } from "../src/download-plan";
import type { Book, PageState } from "../src/types";
import type { BrowserApi } from "../src/browser-api";

const book: Book = {
  id: "123",
  author: "Автор",
  title: "Книга",
  description: "Описание",
  metadata: ["Metadata"],
  image: "https://example.org/cover.jpg",
  files: ["https://example.org/book.mp3"],
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function event<T extends (...args: never[]) => unknown>() {
  const listeners: T[] = [];
  return {
    listeners,
    addListener(listener: T) {
      listeners.push(listener);
    },
    removeListener(listener: T) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
}

it("keeps the download plan, overwrite options and exported description format", () => {
  const items = bookDownloads(book, 7, "job", "Audiobook");
  assert.deepEqual(
    items.map((item) => item.options.filename),
    ["book.mp3", "cover.jpg", "desc.txt", "desc.json"].map(
      (name) => "Автор - Книга/" + name,
    ),
  );
  assert.ok(
    items.every(
      (item) =>
        item.options.saveAs === false &&
        item.options.conflictAction === "overwrite",
    ),
  );
  const decode = (url: string) =>
    decodeURIComponent(url.slice(url.indexOf(",") + 1));
  assert.equal(
    decode(items[2].options.url),
    "Автор - Книга\n\nОписание\n\nMetadata",
  );
  assert.deepEqual(JSON.parse(decode(items[3].options.url)), book);
  assert.equal(replacePathChars("... <>/ ", "Audiobook"), "___");
  assert.equal(replacePathChars("...", "Audiobook"), "Audiobook");
  assert.throws(
    () =>
      bookDownloads(
        { ...book, files: ["javascript:alert(1)"] },
        7,
        "job",
        "Audiobook",
      ),
    /invalidAudioURL/,
  );
});

it("ignores stale content responses across A → B → A and disposes listeners", async () => {
  const dom = new JSDOM('<article data-bid="123"></article>', {
    url: "https://akniga.org/a",
  });
  const onMessage =
    event<
      (
        request: unknown,
        sender: chrome.runtime.MessageSender,
        response: (result: unknown) => void,
      ) => unknown
    >();
  const published: { result: PageState }[] = [];
  const pending: {
    resolve: (book: Book | null) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
  }[] = [];
  const api = {
    i18n: { getMessage: (key: string) => key },
    runtime: {
      onMessage,
      async sendMessage(message: { result: PageState }) {
        published.push(message);
      },
    },
  } as unknown as BrowserApi;
  const controller = new Content(
    dom.window.document,
    dom.window as unknown as Window,
    api,
    (signal) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject, signal });
      }),
  );
  try {
    dom.window.history.pushState({}, "", "/b");
    dom.window.document
      .querySelector("article")!
      .setAttribute("data-bid", "456");
    controller.refresh();
    dom.window.history.pushState({}, "", "/a");
    dom.window.document
      .querySelector("article")!
      .setAttribute("data-bid", "123");
    controller.refresh();
    assert.equal(pending[0].signal.aborted, true);
    assert.equal(pending[1].signal.aborted, true);
    pending[0].reject(new Error("Old failure"));
    pending[1].resolve({ ...book, id: "456" });
    pending[2].resolve({ ...book, title: "Current A" });
    await settle();
    assert.equal(published.at(-1)?.result.content?.title, "Current A");
    assert.ok(published.every((message) => !message.result.error));
  } finally {
    controller.dispose();
    dom.window.close();
  }
  assert.equal(onMessage.listeners.length, 0);
});

it("derives content tab identity from sender", async () => {
  let saved: unknown;
  const api = {
    i18n: { getMessage: (key: string) => key },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value: unknown) => {
          saved = value;
        },
      },
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
    },
    runtime: { onMessage: event(), onStartup: event() },
    downloads: { onChanged: event() },
    tabs: { onRemoved: event(), onUpdated: event() },
    alarms: { onAlarm: event() },
  } as unknown as BrowserApi;
  const background = new Background(api);
  await background.ready;
  const sender = { tab: { id: 7 } } as chrome.runtime.MessageSender;
  await background.handleMessage(
    { type: "bookState", result: { content: book } },
    sender,
  );
  assert.equal(
    (await background.handleMessage({ type: "getState", tabId: 7 }, {}))
      ?.content?.title,
    book.title,
  );
  assert.equal(
    (await background.handleMessage({ type: "getState", tabId: 99 }, {}))
      ?.content,
    undefined,
  );
  assert.ok(saved);
});

it("limits the queue to three own downloads and continues when a slot is released", async () => {
  let nextId = 0;
  const running = new Map<
    number,
    { id: number; state: "in_progress" | "complete" }
  >();
  const starts: string[] = [];
  const api = {
    i18n: { getMessage: (key: string) => key },
    downloads: {
      search: async (query: { id?: number }) =>
        query.id === undefined
          ? [...running.values()].filter((item) => item.state === "in_progress")
          : [running.get(query.id)].filter(Boolean),
      download: async (options: { url: string }) => {
        starts.push(options.url);
        const id = ++nextId;
        running.set(id, { id, state: "in_progress" });
        assert.ok(
          [...running.values()].filter((item) => item.state === "in_progress")
            .length <= 3,
        );
        return id;
      },
    },
    alarms: { create: async () => {}, clear: async () => {} },
  } as unknown as BrowserApi;
  const queue = new DownloadQueue(api, {
    ready: async () => {},
    persist: async () => {},
    fileFinished: async () => {},
  });
  const options = bookDownloads(book, 7, "job", "Audiobook")[0];
  queue.enqueue(
    [1, 2, 3, 4].map((index) => ({
      ...options,
      options: { ...options.options, url: `https://example.org/${index}.mp3` },
    })),
  );
  await Promise.all([queue.run(), queue.run()]);
  assert.equal(starts.length, 3);
  assert.equal(queue.snapshot().queue.length, 1);
  running.get(1)!.state = "complete";
  await queue.onDownloadChanged({ id: 1, state: { current: "complete" } });
  await settle();
  assert.equal(starts.length, 4);
  assert.equal(queue.snapshot().queue.length, 0);
});

it("retains restored jobs after tab closure and reconciles completed browser downloads on startup", async () => {
  const onRemoved = event<(id: number) => void>();
  const onStartup = event<() => void>();
  const onChanged = event<(delta: chrome.downloads.DownloadDelta) => void>();
  let saved: { states?: Record<number, PageState> } = {};
  let downloadState = "in_progress";
  const api = {
    i18n: { getMessage: (key: string) => key },
    storage: {
      local: {
        get: async () => ({
          queue: [],
          activeDownloads: {
            10: { tabId: 7, jobId: "job", filename: "book.mp3" },
          },
          states: { 7: { content: book, jobId: "job", pending: 1 } },
        }),
        set: async (value: typeof saved) => {
          saved = structuredClone(value);
        },
      },
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
    },
    runtime: { onMessage: event(), onStartup },
    downloads: {
      onChanged,
      search: async (query: { id?: number }) =>
        query.id ? [{ id: 10, state: downloadState }] : [],
    },
    tabs: { onRemoved, onUpdated: event() },
    alarms: { onAlarm: event(), clear: async () => {} },
  } as unknown as BrowserApi;
  const background = new Background(api);
  await background.ready;
  onRemoved.listeners[0](7);
  await settle();
  assert.equal(
    (await background.handleMessage({ type: "getState", tabId: 7 }, {}))
      ?.pending,
    1,
  );
  downloadState = "complete";
  onStartup.listeners[0]();
  await settle();
  assert.equal(saved.states?.[7].pending, 0);
  assert.equal(saved.states?.[7].message, "downloadComplete");
  onChanged.listeners[0]({ id: 10, state: { current: "complete" } });
  await settle();
  assert.equal(saved.states?.[7].pending, 0);
});

it("serializes complete storage snapshots even when messages overlap", async () => {
  const writes: { states: Record<number, PageState> }[] = [];
  let release: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = {
    i18n: { getMessage: (key: string) => key },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value: (typeof writes)[number]) => {
          writes.push(structuredClone(value));
          if (writes.length === 1) await firstWrite;
        },
      },
    },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
    },
    runtime: { onMessage: event(), onStartup: event() },
    downloads: { onChanged: event() },
    tabs: { onRemoved: event(), onUpdated: event() },
    alarms: { onAlarm: event() },
  } as unknown as BrowserApi;
  const background = new Background(api);
  await background.ready;
  const sender = { tab: { id: 7 } } as chrome.runtime.MessageSender;
  const first = background.handleMessage(
    { type: "bookState", result: { bookId: "a", loading: true } },
    sender,
  );
  await settle();
  const second = background.handleMessage(
    { type: "bookState", result: { bookId: "b", loading: true } },
    sender,
  );
  await settle();
  assert.equal(writes.length, 1);
  release!();
  await Promise.all([first, second]);
  assert.deepEqual(
    writes.map((value) => value.states[7].bookId),
    ["a", "b"],
  );
});
