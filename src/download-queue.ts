import type { BrowserApi } from "./browser-api";
import {
  errorMessage,
  type DownloadOptions,
  type DownloadOwner,
  type QueueEntry,
} from "./types";

interface QueueEvents {
  ready: () => Promise<void>;
  persist: () => Promise<void>;
  fileFinished: (owner: DownloadOwner, error?: string) => Promise<void>;
}

function downloadOptions(options: DownloadOptions): DownloadOptions {
  if (
    !options.url.startsWith("data:") ||
    typeof URL.createObjectURL !== "function"
  )
    return options;
  // Firefox downloads text via Blob URLs; Chromium workers use data: directly.
  const comma = options.url.indexOf(",");
  const text = decodeURIComponent(options.url.slice(comma + 1));
  const blob = new Blob([text], { type: options.url.slice(5, comma) });
  return { ...options, url: URL.createObjectURL(blob) };
}

export class DownloadQueue {
  private queue: QueueEntry[] = [];
  private activeDownloads: Record<number, DownloadOwner> = {};
  private startingFiles = false;
  private objectURLs = new Map<number, string>();

  constructor(
    private api: BrowserApi,
    private events: QueueEvents,
  ) {}

  enqueue(items: QueueEntry[]) {
    this.queue.push(...items);
  }

  hasWork(tabId: number) {
    return (
      this.queue.some((item) => item.tabId === tabId) ||
      Object.values(this.activeDownloads).some((owner) => owner.tabId === tabId)
    );
  }

  hasActive(tabId: number, jobId?: string) {
    return Object.values(this.activeDownloads).some(
      (owner) => owner.tabId === tabId && owner.jobId === jobId,
    );
  }

  restore(
    queue: QueueEntry[] = [],
    active: Record<number, DownloadOwner | number> = {},
  ) {
    this.queue = queue;
    // Older versions stored only the owning tab ID.
    this.activeDownloads = Object.fromEntries(
      Object.entries(active).map(([id, owner]) => [
        id,
        typeof owner === "number" ? { tabId: owner } : owner,
      ]),
    );
  }

  snapshot() {
    return structuredClone({
      queue: this.queue,
      activeDownloads: this.activeDownloads,
    });
  }

  startPending() {
    if (this.queue.length) void this.run().catch(console.error);
  }

  async run(): Promise<void> {
    await this.events.ready();
    if (this.startingFiles) return;
    this.startingFiles = true;
    try {
      const running = await this.api.downloads.search({
        state: "in_progress",
        paused: false,
      });
      const ownRunning = running.filter(
        (download) => this.activeDownloads[download.id],
      );
      let slots = Math.max(0, 3 - ownRunning.length);
      while (this.queue.length && slots-- > 0)
        await this.startFile(this.queue.shift()!);
      if (!this.queue.length) {
        await this.api.alarms.clear("downloadQueue");
        return;
      }
      await this.api.alarms.create("downloadQueue", { delayInMinutes: 0.5 });
      setTimeout(() => this.startPending(), 300);
    } finally {
      this.startingFiles = false;
    }
  }

  private async startFile(item: QueueEntry) {
    const owner = {
      tabId: item.tabId,
      jobId: item.jobId,
      filename: item.options.filename,
    };
    let options: DownloadOptions | undefined;
    let id: number;
    try {
      options = downloadOptions(item.options);
      id = await this.api.downloads.download(options);
    } catch (error) {
      if (options && options.url !== item.options.url)
        URL.revokeObjectURL(options.url);
      await this.events.fileFinished(owner, errorMessage(error));
      return;
    }
    if (options.url !== item.options.url) this.objectURLs.set(id, options.url);
    this.activeDownloads[id] = owner;
    await this.events.persist();
    // Small files can finish before their ID is registered.
    const [download] = await this.api.downloads.search({ id });
    if (download)
      await this.onDownloadChanged({
        id,
        state: { current: download.state },
        error: { current: download.error },
      });
  }

  async onDownloadChanged(
    delta: chrome.downloads.DownloadDelta,
  ): Promise<void> {
    await this.events.ready();
    const status = delta.state?.current;
    if (status !== "complete" && status !== "interrupted") return;
    const owner = this.activeDownloads[delta.id];
    if (!owner) return;
    delete this.activeDownloads[delta.id];
    const url = this.objectURLs.get(delta.id);
    if (url) URL.revokeObjectURL(url);
    this.objectURLs.delete(delta.id);
    const error =
      status === "interrupted"
        ? delta.error?.current ||
          this.api.i18n.getMessage("downloadInterrupted")
        : undefined;
    await this.events.fileFinished(owner, error);
    this.startPending();
  }

  async reconcileDownloads(): Promise<void> {
    await this.events.ready();
    for (const id of Object.keys(this.activeDownloads).map(Number)) {
      const [download] = await this.api.downloads.search({ id });
      if (download?.state === "in_progress") continue;
      await this.onDownloadChanged({
        id,
        state: { current: download?.state || "interrupted" },
        error: {
          current:
            download?.error ||
            this.api.i18n.getMessage("downloadMissingAfterRestart"),
        },
      });
    }
    this.startPending();
  }
}
