import { availableBrowser, type BrowserApi } from "./browser-api";
import { SITE_URL } from "./constants";
import { bookDownloads } from "./download-plan";
import { DownloadQueue } from "./download-queue";
import {
  errorMessage,
  type BackgroundMessage,
  type Book,
  type DownloadOwner,
  type PageState,
  type SavedState,
} from "./types";

export class Background {
  private states: Record<number, PageState> = {};
  private writing = Promise.resolve();
  private nextJob = 0;
  private queue: DownloadQueue;
  private restored: Promise<void>;
  readonly ready: Promise<void>;

  constructor(private api: BrowserApi) {
    this.queue = new DownloadQueue(api, {
      ready: () => this.restored,
      persist: () => this.persist(),
      fileFinished: (owner, error) => this.onFileFinished(owner, error),
    });
    this.restored = this.restore();
    this.ready = this.restored.then(() => this.queue.reconcileDownloads());
    this.listen();
  }

  private async restore() {
    const saved = await this.api.storage.local.get<SavedState>([
      "queue",
      "activeDownloads",
      "states",
    ]);
    this.states = saved.states ?? {};
    this.queue.restore(saved.queue, saved.activeDownloads);
  }

  private persist() {
    const snapshot = {
      ...this.queue.snapshot(),
      states: structuredClone(this.states),
    };
    this.writing = this.writing
      // The previous caller already received its error; allow the next save.
      .catch(() => {})
      .then(() => this.api.storage.local.set(snapshot));
    return this.writing;
  }

  private async setState(tabId: number, state: PageState) {
    this.states[tabId] = state;
    await this.persist();
    const action = this.api.action || this.api.browserAction;
    try {
      await action.setBadgeBackgroundColor({
        tabId,
        color: state.error ? "#b91c1c" : "#2563eb",
      });
      await action.setBadgeText({
        tabId,
        text: state.error ? "!" : state.pending ? String(state.pending) : "",
      });
      await action.setTitle({
        tabId,
        title: this.api.i18n.getMessage("appName"),
      });
      await action.setIcon({
        tabId,
        path:
          state.content && !state.error
            ? "/img/icon_24_24.png"
            : "/img/icon_24_24_gray.png",
      });
    } catch {
      /* A closed tab has no badge, but its downloads continue. */
    }
  }

  async handleMessage(
    request: BackgroundMessage,
    sender: chrome.runtime.MessageSender,
  ): Promise<PageState> {
    await this.ready;
    const tabId = request.type === "bookState" ? sender.tab?.id : request.tabId;
    if (tabId === undefined || !Number.isInteger(tabId))
      throw new Error(this.api.i18n.getMessage("noActiveTab"));
    switch (request.type) {
      case "bookState":
        return this.updatePage(tabId, request.result);
      case "getState":
        return (
          this.states[tabId] || {
            message: this.api.i18n.getMessage("openBookPage"),
          }
        );
      case "refresh":
      case "download":
        return this.processBookCommand(tabId, request.type);
      default:
        throw new Error(this.api.i18n.getMessage("noBookData"));
    }
  }

  private async updatePage(tabId: number, result: PageState) {
    const previous = this.states[tabId];
    const previousId = previous?.bookId || previous?.content?.id;
    const bookId = result.bookId || result.content?.id;
    const sameBook = previousId && previousId === bookId;
    const hasDownloadStatus =
      previous?.pending || previous?.jobId || previous?.error;
    const hasFinishedLoading = previous?.message && !previous.loading;
    if (sameBook && (hasDownloadStatus || hasFinishedLoading)) return previous;
    await this.setState(tabId, result);
    return result;
  }

  private async readBook(tabId: number): Promise<PageState> {
    try {
      const result: PageState = await this.api.tabs.sendMessage(tabId, {
        type: "readBook",
      });
      if (result?.content || result?.error || result?.stale) return result;
      return { error: this.api.i18n.getMessage("noBookData") };
    } catch {
      return { error: this.api.i18n.getMessage("bookPageUnavailable") };
    }
  }

  private async processBookCommand(
    tabId: number,
    command: "refresh" | "download",
  ) {
    const previous = this.states[tabId];
    if (previous?.pending) return previous;
    const result = await this.readBook(tabId);
    if (result.stale || this.states[tabId] !== previous)
      return this.states[tabId] || {};
    if (command === "refresh") {
      // Reading metadata must not hide a failed download of the same book.
      const sameBook =
        !result.content || previous?.content?.id === result.content.id;
      if (sameBook && previous?.error) return previous;
    } else if (result.content && !result.error) {
      return this.startBookDownload(tabId, result.content);
    }
    await this.setState(tabId, result);
    return result;
  }

  private async startBookDownload(tabId: number, book: Book) {
    if (this.queue.hasActive(tabId, this.states[tabId]?.jobId))
      throw new Error("previousDownloadsRunning");
    const jobId = Date.now() + "-" + ++this.nextJob;
    const items = bookDownloads(
      book,
      tabId,
      jobId,
      this.api.i18n.getMessage("audiobook"),
    );
    this.queue.enqueue(items);
    await this.setState(tabId, {
      content: book,
      jobId,
      pending: items.length,
      message: this.api.i18n.getMessage("downloadInProgress"),
    });
    this.queue.startPending();
    return this.states[tabId];
  }

  private async removeTab(tabId: number) {
    await this.ready;
    if (this.queue.hasWork(tabId)) return;
    delete this.states[tabId];
    await this.persist();
  }

  private async onFileFinished(
    { tabId, jobId, filename }: DownloadOwner,
    error?: string,
  ) {
    const previous = this.states[tabId];
    // The tab may already display a different book. Still save the queue result.
    if (!previous || previous.jobId !== jobId) return this.persist();
    const state = {
      ...previous,
      pending: Math.max(0, (previous.pending || 0) - 1),
    };
    if (error) {
      state.failures = [
        ...(state.failures ?? []),
        {
          filename: filename ?? this.api.i18n.getMessage("file"),
          reason: error,
        },
      ];
      const failures = state.failures.map(
        (file) => `${file.filename} (${file.reason})`,
      );
      state.error = this.api.i18n.getMessage(
        "downloadFailures",
        failures.join(", "),
      );
    }
    let message = state.error
      ? "downloadFinishedWithErrors"
      : "downloadComplete";
    if (state.pending) message = "downloadInProgress";
    state.message = this.api.i18n.getMessage(message);
    await this.setState(tabId, state);
  }

  private async navigate(tabId: number, url: string) {
    await this.ready;
    if (!url.startsWith(SITE_URL))
      return this.setState(tabId, { content: null });
    try {
      await this.api.tabs.sendMessage(tabId, { type: "pageChanged" });
    } catch {
      /* Full navigation reinjects content. */
    }
  }

  private listen() {
    // MV3 listeners must be registered before asynchronous initialization finishes.
    this.api.runtime.onMessage.addListener(
      (request: BackgroundMessage, sender, respond) => {
        void this.handleMessage(request, sender).then(
          respond,
          (error: unknown) => {
            const message = errorMessage(error);
            respond({ error: this.api.i18n.getMessage(message) || message });
          },
        );
        return true;
      },
    );
    this.api.downloads.onChanged.addListener((delta) => {
      void this.queue.onDownloadChanged(delta).catch(console.error);
    });
    this.api.tabs.onRemoved.addListener((id) => {
      void this.removeTab(id).catch(console.error);
    });
    this.api.tabs.onUpdated.addListener((id, change) => {
      if (change.url) void this.navigate(id, change.url).catch(console.error);
    });
    this.api.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "downloadQueue") this.queue.startPending();
    });
    this.api.runtime.onStartup.addListener(() => {
      void this.queue.reconcileDownloads().catch(console.error);
    });
  }
}

const api = availableBrowser();
if (api) new Background(api);
