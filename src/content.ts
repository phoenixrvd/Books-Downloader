import { availableBrowser, type BrowserApi } from "./browser-api";
import { fetchBook, prepareBook, readSecurityKey } from "./book-api";
import { getBookId, parsePage } from "./page-parser";
import { errorMessage, type Book, type PageState } from "./types";

async function readCurrentBook(
  document: Document,
  signal: AbortSignal,
): Promise<Book | null> {
  const page = parsePage(document);
  if (!page) return null;
  const securityKey = readSecurityKey(document);
  const data = await fetchBook(page.id, securityKey, fetch, signal);
  return prepareBook(page, data);
}

export class Content {
  private observedPage?: string;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private controller = new AbortController();
  private disposed = false;
  private observer: MutationObserver;

  constructor(
    private document: Document,
    private window: Window,
    private api: BrowserApi,
    private loadBook = (signal: AbortSignal) =>
      readCurrentBook(document, signal),
  ) {
    this.observer = new document.defaultView!.MutationObserver(
      this.scheduleRefresh,
    );
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-bid"],
    });
    api.runtime.onMessage.addListener(this.onMessage);
    document.addEventListener("pjax:success", this.scheduleRefresh);
    window.addEventListener("popstate", this.scheduleRefresh);
    window.addEventListener("pageshow", this.scheduleRefresh);
    window.addEventListener("pagehide", this.onPageHide);
    this.refresh();
  }

  private currentPage() {
    return (
      this.window.location.pathname +
      this.window.location.search +
      ":" +
      (getBookId(this.document) || "")
    );
  }

  async readBook(): Promise<PageState> {
    const page = this.currentPage();
    const generation = this.generation;
    let result: PageState;
    try {
      result = { content: await this.loadBook(this.controller.signal) };
    } catch (error) {
      const message = errorMessage(error);
      result = { error: this.api.i18n.getMessage(message) || message };
    }
    if (
      this.disposed ||
      generation !== this.generation ||
      page !== this.currentPage()
    ) {
      this.scheduleRefresh();
      return { stale: true };
    }
    return result;
  }

  private async publish(result: PageState) {
    if (this.disposed) return;
    try {
      await this.api.runtime.sendMessage({ type: "bookState", result });
    } catch {
      /* Updating the extension can invalidate this content context. */
    }
  }

  refresh() {
    const page = this.currentPage();
    if (this.disposed || page === this.observedPage) return;
    this.observedPage = page;
    ++this.generation;
    this.controller.abort();
    this.controller = new AbortController();
    const bookId = getBookId(this.document);
    if (!bookId) {
      void this.publish({ content: null });
      return;
    }
    void this.publish({
      bookId,
      loading: true,
      message: this.api.i18n.getMessage("loadingBook"),
    });
    void this.readBook().then((result) => {
      if (!result.stale) void this.publish({ bookId, ...result });
    });
  }

  private scheduleRefresh = () => {
    if (
      this.disposed ||
      this.timer !== undefined ||
      this.currentPage() === this.observedPage
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refresh();
    }, 100);
  };

  private onMessage = (
    request: { type: string },
    _sender: chrome.runtime.MessageSender,
    respond: (result: unknown) => void,
  ) => {
    if (request?.type === "pageChanged") {
      this.scheduleRefresh();
      respond({});
      return;
    }
    if (request?.type !== "readBook") return;
    void this.readBook().then(respond);
    return true;
  };

  private onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) this.dispose();
  };

  dispose() {
    this.disposed = true;
    this.controller.abort();
    clearTimeout(this.timer);
    this.observer.disconnect();
    this.api.runtime.onMessage.removeListener(this.onMessage);
    this.document.removeEventListener("pjax:success", this.scheduleRefresh);
    this.window.removeEventListener("popstate", this.scheduleRefresh);
    this.window.removeEventListener("pageshow", this.scheduleRefresh);
    this.window.removeEventListener("pagehide", this.onPageHide);
  }
}

const api = availableBrowser();
if (api && typeof document !== "undefined") new Content(document, window, api);
