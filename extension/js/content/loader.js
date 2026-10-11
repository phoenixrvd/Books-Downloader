function readBook(sendResponse) {
  const page = currentPage();
  const generation = pageGeneration;
  const respond = (result) =>
    sendResponse(
      page === currentPage() && generation === pageGeneration
        ? result
        : { stale: true },
    );
  loadBookData(
    (content) => respond({ content: content }),
    (error) => {
      if (
        page !== currentPage() ||
        generation !== pageGeneration ||
        error.code === "STALE_PAGE"
      ) {
        sendResponse({ stale: true });
        schedulePageRefresh();
        return;
      }
      console.error(chrome.i18n.getMessage("appName"), error);
      respond({ error: error.message });
    },
  );
}

function currentPage() {
  return location.pathname + location.search + ":" + (getBookId() || "");
}

let observedPage;
let pageGeneration = 0;
let navigationTimer;

function publishBookState(result) {
  chrome.runtime.sendMessage({ type: "bookState", result: result }, () => {
    // The extension may have been reloaded while the page was open.
    void chrome.runtime.lastError;
  });
}

function refreshPageState() {
  const page = currentPage();
  if (page === observedPage) return;
  observedPage = page;
  const generation = ++pageGeneration;
  const bookId = getBookId();
  publishBookState(
    bookId
      ? {
          bookId: bookId,
          loading: true,
          message: chrome.i18n.getMessage("loadingBook"),
        }
      : { content: null },
  );
  if (!bookId) return;
  readBook((result) => {
    if (
      generation === pageGeneration &&
      page === currentPage() &&
      !result.stale
    ) {
      publishBookState(Object.assign({ bookId: bookId }, result));
    }
  });
}

function schedulePageRefresh() {
  if (navigationTimer || currentPage() === observedPage) return;
  navigationTimer = setTimeout(() => {
    navigationTimer = undefined;
    refreshPageState();
  }, 100);
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.type === "pageChanged") {
    schedulePageRefresh();
    sendResponse({});
    return;
  }
  if (request.type !== "readBook") return;
  readBook(sendResponse);
  return true;
});

// PJAX changes the article and history without reinjecting content scripts.
document.addEventListener("pjax:success", schedulePageRefresh);
window.addEventListener("popstate", schedulePageRefresh);
window.addEventListener("pageshow", schedulePageRefresh);
const pageObserver = new MutationObserver(schedulePageRefresh);
pageObserver.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-bid"],
});
refreshPageState();
