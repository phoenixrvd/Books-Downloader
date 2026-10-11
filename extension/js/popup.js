var chrome = typeof browser !== "undefined" ? browser : globalThis.chrome;
const button = document.getElementById("download");
const status = document.getElementById("status");
const cover = document.getElementById("cover");
let tabId;

document.documentElement.lang = chrome.i18n.getMessage("languageCode");
document.title = chrome.i18n.getMessage("appName");
document.querySelectorAll("[data-i18n]").forEach((element) => {
  element.textContent = chrome.i18n.getMessage(element.dataset.i18n);
});

cover.addEventListener("error", () => {
  cover.hidden = true;
});
cover.addEventListener("load", () => {
  cover.hidden = false;
});

function render(state) {
  document.getElementById("book").textContent = state.content
    ? state.content.title
    : "";
  const image = state.content && state.content.image;
  if (image && /^https?:\/\//.test(image)) {
    cover.alt = chrome.i18n.getMessage(
      "coverAlt",
      state.content.title || chrome.i18n.getMessage("audiobook"),
    );
    if (cover.getAttribute("src") !== image) {
      cover.hidden = true;
      cover.src = image;
    }
  } else {
    cover.hidden = true;
    cover.removeAttribute("src");
    cover.alt = "";
  }
  status.textContent =
    state.error ||
    state.message ||
    (state.content ? "" : chrome.i18n.getMessage("openBookPage"));
  status.hidden = !status.textContent;
  status.className = state.error ? "error" : "";
  button.textContent = chrome.i18n.getMessage(
    state.error ? "retry" : "buttonTitle",
  );
  button.disabled =
    (!state.error && !state.content) || !!state.pending || !!state.loading;
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = chrome.i18n.getMessage("loadingBook");
  status.hidden = false;
  try {
    render(await chrome.runtime.sendMessage({ type: "download", tabId }));
  } catch (error) {
    render({ error: chrome.i18n.getMessage("extensionUnavailable") });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.states && changes.states.newValue[tabId])
    render(changes.states.newValue[tabId]);
});

(async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0].id;
    if (!tabs[0].url || !tabs[0].url.startsWith("https://akniga.org/")) {
      render({ message: chrome.i18n.getMessage("openBookPage") });
      return;
    }
    const state = await chrome.runtime.sendMessage({ type: "getState", tabId });
    render(state);
    if (!state.pending && !state.error) {
      status.textContent = chrome.i18n.getMessage("loadingBook");
      status.hidden = false;
      button.disabled = true;
      render(await chrome.runtime.sendMessage({ type: "refresh", tabId }));
    }
  } catch (error) {
    render({ error: chrome.i18n.getMessage("statusUnavailable") });
  }
})();
