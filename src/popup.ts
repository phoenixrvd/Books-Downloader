import { SITE_URL } from "./constants";
import type { PageState, PopupMessage } from "./types";
import { browserApi } from "./browser-api";
import { bookDownloads } from "./download-plan";

const api = browserApi();

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing popup element: ${id}`);
  return found as T;
}

const button = element<HTMLButtonElement>("download");
const status = element<HTMLParagraphElement>("status");
const cover = element<HTMLImageElement>("cover");
const book = element<HTMLHeadingElement>("book");
const metadata = element<HTMLDListElement>("metadata");
const files = element<HTMLUListElement>("files");
const individualDownloads = element<HTMLElement>("individual-downloads");
let tabId: number | undefined;
let openFilesOnly = false;

document.documentElement.lang = api.i18n.getMessage("languageCode");
document.title = api.i18n.getMessage("appName");
document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
  const key = node.dataset.i18n;
  if (key) node.textContent = api.i18n.getMessage(key);
});

cover.addEventListener("error", () => {
  cover.hidden = true;
});
cover.addEventListener("load", () => {
  cover.hidden = false;
});

export function render(state: PageState): void {
  book.textContent = state.content?.title || "";
  book.hidden = !book.textContent;
  metadata.replaceChildren();
  const fields =
    state.content?.metadataFields ??
    state.content?.metadata.map((value) => ({ label: "", value })) ??
    [];
  for (const { label, value } of fields) {
    const row = document.createElement("div");
    if (label) {
      const term = document.createElement("dt");
      term.textContent = label;
      row.append(term);
    }
    const detail = document.createElement("dd");
    detail.textContent = value;
    row.append(detail);
    metadata.append(row);
  }
  metadata.hidden = !fields.length;
  const image = state.content?.image;
  if (image && /^https?:\/\//.test(image)) {
    cover.alt = api.i18n.getMessage(
      "coverAlt",
      state.content?.title || api.i18n.getMessage("audiobook"),
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
    (state.content ? "" : api.i18n.getMessage("openBookPage"));
  status.hidden = !status.textContent;
  status.className = state.error ? "error" : "";
  button.textContent = api.i18n.getMessage(
    state.error ? "retry" : "buttonTitle",
  );
  button.disabled =
    (!state.error && !state.content) || !!state.pending || !!state.loading;
  renderFiles(state);
}

function renderFiles(state: PageState) {
  files.replaceChildren();
  individualDownloads.hidden = !state.content;
  if (!state.content) return;
  const downloads = bookDownloads(
    state.content,
    tabId ?? 0,
    "",
    api.i18n.getMessage("audiobook"),
  );
  for (const { options } of downloads) {
    if (openFilesOnly && !options.url.startsWith("http")) continue;
    const item = document.createElement("li");
    const open = document.createElement("a");
    const filename = options.filename.split("/").pop()!;
    open.textContent =
      options.url.startsWith("http") && filename !== "cover.jpg"
        ? decodeURIComponent(
            new URL(options.url).pathname.split("/").pop() || filename,
          )
        : filename;
    open.href = options.url;
    open.download = filename;
    open.target = "_blank";
    open.rel = "noopener";
    open.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        if (openFilesOnly) {
          await api.tabs.create({ url: options.url, active: true });
        } else {
          await api.downloads.download(options);
        }
        window.close();
      } catch (error) {
        status.textContent = String(error);
        status.hidden = false;
        status.className = "error";
      }
    });
    item.append(open);
    files.append(item);
  }
}

async function request(type: PopupMessage["type"]): Promise<PageState> {
  if (tabId === undefined) throw new Error("No active tab");
  if (openFilesOnly) return api.tabs.sendMessage(tabId, { type: "readBook" });
  const message: PopupMessage = { type, tabId };
  return api.runtime.sendMessage(message);
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = api.i18n.getMessage("loadingBook");
  status.hidden = false;
  try {
    render(await request("download"));
  } catch {
    render({ error: api.i18n.getMessage("extensionUnavailable") });
  }
});

api.storage.onChanged.addListener((changes, area) => {
  if (openFilesOnly || area !== "local" || tabId === undefined) return;
  const states = changes.states?.newValue as
    Record<number, PageState> | undefined;
  const state = states?.[tabId];
  if (state) render(state);
});

void (async () => {
  try {
    const platform = await api.runtime.getPlatformInfo();
    openFilesOnly = platform.os === "android";
    document.documentElement.classList.toggle("mobile", openFilesOnly);
    button.hidden = openFilesOnly;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      render({ error: api.i18n.getMessage("noActiveTab") });
      button.disabled = true;
      return;
    }
    tabId = tab.id;
    if (!tab.url?.startsWith(SITE_URL)) {
      render({ message: api.i18n.getMessage("openBookPage") });
      return;
    }
    const state = await request("getState");
    render(state);
    if (!openFilesOnly && !state.pending && !state.error) {
      status.textContent = api.i18n.getMessage("loadingBook");
      status.hidden = false;
      button.disabled = true;
      render(await request("refresh"));
    }
  } catch {
    render({ error: api.i18n.getMessage("statusUnavailable") });
  }
})();
