import assert from "node:assert/strict";
import { Background } from "../src/background";
import type { BrowserApi } from "../src/browser-api";
import { bookDownloads } from "../src/download-plan";
import type { Book, DownloadOptions, PageState } from "../src/types";

const book: Book = {
  id: "123",
  author: "Author",
  title: "Book",
  description: "Description",
  metadata: [],
  files: ["https://audio.example/book.mp3"],
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function event<T extends (...args: never[]) => unknown>() {
  const listeners: T[] = [];
  return {
    listeners,
    addListener(listener: T) {
      listeners.push(listener);
    },
  };
}

function fixture(
  saved: unknown,
  downloads: {
    id: number;
    state: "in_progress" | "complete";
    error?: string;
  }[],
) {
  const items = new Map(downloads.map((item) => [item.id, item]));
  const starts: DownloadOptions[] = [];
  const changed = event<(delta: chrome.downloads.DownloadDelta) => void>();
  let nextId = 100;
  const api = {
    i18n: { getMessage: (key: string) => key },
    action: {
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
    },
    storage: {
      local: { get: async () => structuredClone(saved), set: async () => {} },
    },
    downloads: {
      onChanged: changed,
      search: async (query: { id?: number }) =>
        query.id === undefined
          ? [...items.values()].filter((item) => item.state === "in_progress")
          : [items.get(query.id)].filter(Boolean),
      download: async (options: DownloadOptions) => {
        starts.push(options);
        const id = ++nextId;
        items.set(id, { id, state: "complete" });
        return id;
      },
    },
    tabs: {
      onRemoved: event(),
      onUpdated: event(),
      sendMessage: async () => ({ content: book }),
    },
    runtime: { onMessage: event(), onStartup: event() },
    alarms: { onAlarm: event(), clear: async () => {}, create: async () => {} },
  } as unknown as BrowserApi;
  return {
    api,
    starts,
    async complete(id: number) {
      items.get(id)!.state = "complete";
      for (const listener of changed.listeners)
        listener({ id, state: { current: "complete" } });
      await settle();
    },
  };
}

async function state(background: Background): Promise<PageState | undefined> {
  return background.handleMessage({ type: "getState", tabId: 7 }, {});
}

it("does not apply an old download's progress to the newly displayed book", async () => {
  const fake = fixture(
    {
      queue: [],
      activeDownloads: { 10: { tabId: 7, jobId: "old-book" } },
      states: { 7: { content: book, jobId: "old-book", pending: 1 } },
    },
    [{ id: 10, state: "in_progress" }],
  );
  const background = new Background(fake.api);
  await background.ready;
  const nextBook = { ...book, id: "456", title: "Next book" };
  await background.handleMessage(
    { type: "bookState", result: { content: nextBook } },
    { tab: { id: 7 } } as chrome.runtime.MessageSender,
  );
  await fake.complete(10);
  assert.deepEqual(await state(background), { content: nextBook });
});

it("reconciles saved completions on worker initialization without onStartup", async () => {
  const fake = fixture(
    {
      queue: [],
      activeDownloads: { 10: { tabId: 7, jobId: "job" } },
      states: { 7: { content: book, jobId: "job", pending: 1 } },
    },
    [{ id: 10, state: "complete" }],
  );
  const background = new Background(fake.api);
  await background.ready;
  assert.equal((await state(background))?.pending, 0);
  assert.equal((await state(background))?.message, "downloadComplete");
  assert.equal(fake.starts.length, 0);
});

it("restarts a restored queue without an onStartup or alarm event", async () => {
  const queued = bookDownloads(book, 7, "job", "Audiobook")[0];
  const fake = fixture(
    {
      queue: [queued],
      activeDownloads: { 10: { tabId: 7, jobId: "job" } },
      states: { 7: { content: book, jobId: "job", pending: 2 } },
    },
    [{ id: 10, state: "complete" }],
  );
  const background = new Background(fake.api);
  await background.ready;
  await settle();
  assert.equal(fake.starts.length, 1);
  assert.equal((await state(background))?.pending, 0);
});

it("marks a browser download missing after restart as failed without starting it again", async () => {
  const fake = fixture(
    {
      queue: [],
      activeDownloads: { 10: { tabId: 7, jobId: "job", filename: "book.mp3" } },
      states: { 7: { content: book, jobId: "job", pending: 1 } },
    },
    [],
  );
  const background = new Background(fake.api);
  await background.ready;
  assert.equal((await state(background))?.pending, 0);
  assert.deepEqual((await state(background))?.failures, [
    { filename: "book.mp3", reason: "downloadMissingAfterRestart" },
  ]);
  assert.equal(fake.starts.length, 0);
});

it("keeps an unfinished failed batch intact and allows a full retry only after it finishes", async () => {
  const fake = fixture(
    {
      queue: [],
      activeDownloads: {
        10: { tabId: 7, jobId: "old" },
        11: { tabId: 7, jobId: "old" },
      },
      states: {
        7: { content: book, jobId: "old", pending: 2, error: "Cover failed" },
      },
    },
    [
      { id: 10, state: "in_progress" },
      { id: 11, state: "in_progress" },
    ],
  );
  const background = new Background(fake.api);
  await background.ready;
  const blocked = await background.handleMessage(
    { type: "download", tabId: 7 },
    {},
  );
  assert.equal(blocked?.pending, 2);
  assert.equal(blocked?.jobId, "old");
  assert.equal(fake.starts.length, 0);
  await fake.complete(10);
  await fake.complete(11);
  assert.equal((await state(background))?.pending, 0);
  await background.handleMessage({ type: "download", tabId: 7 }, {});
  await settle();
  assert.equal(fake.starts.length, 3);
  assert.notEqual((await state(background))?.jobId, "old");
  assert.equal((await state(background))?.error, undefined);
});
