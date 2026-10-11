// Service workers load shared constants here; Firefox loads them via the manifest.
if (typeof importScripts === "function") importScripts("constants.js");

// Firefox's browser namespace consistently provides Promise-based APIs.
var chrome = typeof browser !== "undefined" ? browser : globalThis.chrome;
const action = chrome.action || chrome.browserAction;
let queue = [];
let activeDownloads = {};
let states = {};
let watching = false;
let nextJob = 0;
const objectURLs = new Map();
const ready = chrome.storage.local
  .get(["queue", "activeDownloads", "states"])
  .then((saved) => {
    queue = saved.queue || [];
    activeDownloads = saved.activeDownloads || {};
    states = saved.states || {};
  });

function persist() {
  return chrome.storage.local.set({ queue, activeDownloads, states });
}

async function setState(tabId, state) {
  states[tabId] = state;
  await persist();
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
      title: state.error || state.message || chrome.i18n.getMessage("appName"),
    });
    await action.setIcon({
      tabId,
      path:
        state.content && !state.error
          ? "/img/icon_24_24.png"
          : "/img/icon_24_24_gray.png",
    });
  } catch (error) {
    // Closing a tab must not stop its queued downloads.
    console.debug(chrome.i18n.getMessage("appName"), error);
  }
}

function replacePathChars(path) {
  return (
    path
      .replace(/[~!@#$%^&*()_|+=?;:'"<>\{\}\[\]\\\/`\x00-\x1f]/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "") || chrome.i18n.getMessage("audiobook")
  );
}

function textURL(text, type = "text/plain") {
  return "data:" + type + ";charset=UTF-8," + encodeURIComponent(text);
}

function downloadOptions(options) {
  const prepared = Object.assign({}, options);
  // Firefox rejects data: downloads but its background document supports
  // Blob URLs. Chrome's service worker has no createObjectURL and can use data:.
  if (
    prepared.url.startsWith("data:") &&
    typeof Blob !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const comma = prepared.url.indexOf(",");
    const type = prepared.url.slice(5, comma);
    const text = decodeURIComponent(prepared.url.slice(comma + 1));
    prepared.url = URL.createObjectURL(new Blob([text], { type }));
  }
  return prepared;
}

function revokeDownloadURL(id) {
  const url = objectURLs.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectURLs.delete(id);
  }
}

function bookDownloads(content, tabId, jobId) {
  if (!content || !Array.isArray(content.files) || !content.files.length)
    throw new Error(chrome.i18n.getMessage("invalidAudioURL"));
  const directory = replacePathChars(
    content.author ? content.author + " - " + content.title : content.title,
  );
  const items = [];
  function add(filename, url) {
    // Do not open concurrent Save As dialogs, even when Chrome's
    // "Ask where to save each file" preference is enabled.
    items.push({
      tabId,
      jobId,
      options: {
        url,
        filename: directory + "/" + filename,
        conflictAction: "overwrite",
        saveAs: false,
      },
    });
  }
  // Start the actual audiobook before its supplementary files.
  content.files.forEach((url, index) => {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      url.includes("/undefined/")
    )
      throw new Error(chrome.i18n.getMessage("invalidAudioURL"));
    const basename = parsed.pathname.substring(
      parsed.pathname.lastIndexOf("/") + 1,
    );
    add(replacePathChars(basename || index + 1 + ".mp3"), url);
  });
  if (content.image) add("cover.jpg", content.image);
  add(
    "desc.txt",
    textURL(
      [
        content.author + " - " + content.title,
        "",
        content.description,
        "",
        content.metadata.join("\n"),
      ].join("\n"),
    ),
  );
  add(
    "desc.json",
    textURL(JSON.stringify(content, null, 2), "application/json"),
  );
  return items;
}

function downloadOwner(value) {
  // Also accept download IDs saved by the previous extension version.
  return typeof value === "number" ? { tabId: value } : value;
}

async function failDownload(
  tabId,
  detail,
  jobId,
  filename = chrome.i18n.getMessage("file"),
) {
  console.error(chrome.i18n.getMessage("appName"), filename, detail);
  // An interrupted cover/description must not discard queued audio tracks.
  if (states[tabId] && states[tabId].jobId === jobId) {
    const state = Object.assign({}, states[tabId]);
    state.failures = (state.failures || []).concat({
      filename,
      reason: detail,
    });
    state.pending = Math.max(0, (state.pending || 0) - 1);
    state.error = chrome.i18n.getMessage(
      "downloadFailures",
      state.failures
        .map((file) => file.filename + " (" + file.reason + ")")
        .join(", "),
    );
    state.message = chrome.i18n.getMessage(
      state.pending ? "downloadInProgress" : "downloadFinishedWithErrors",
    );
    await setState(tabId, state);
  }
  await persist();
}

async function watchQueuedItems() {
  await ready;
  if (watching) return;
  watching = true;
  try {
    const running = await chrome.downloads.search({
      state: "in_progress",
      paused: false,
    });
    const ownRunning = running.filter(
      (download) => activeDownloads[download.id],
    );
    let slots = Math.max(0, 3 - ownRunning.length);
    while (queue.length && slots-- > 0) {
      const item = queue.shift();
      let prepared;
      let id;
      try {
        prepared = downloadOptions(item.options);
        id = await chrome.downloads.download(prepared);
        if (prepared.url !== item.options.url) objectURLs.set(id, prepared.url);
        activeDownloads[id] = {
          tabId: item.tabId,
          jobId: item.jobId,
          filename: item.options.filename,
        };
        await persist();
        // Tiny data URLs may finish before their ID has been registered.
        const results = await chrome.downloads.search({ id }).catch((error) => {
          console.debug(chrome.i18n.getMessage("appName"), error);
          return [];
        });
        const download = results[0];
        if (download && ["complete", "interrupted"].includes(download.state)) {
          await handleDownloadChange({
            id,
            state: { current: download.state },
            error: { current: download.error },
          });
        }
      } catch (error) {
        if (id === undefined && prepared && prepared.url !== item.options.url)
          URL.revokeObjectURL(prepared.url);
        await failDownload(
          item.tabId,
          error.message,
          item.jobId,
          item.options.filename,
        );
      }
    }
    if (queue.length) {
      await chrome.alarms.create("downloadQueue", { delayInMinutes: 0.5 });
      setTimeout(watchQueuedItems, 300);
    } else {
      await chrome.alarms.clear("downloadQueue");
    }
  } finally {
    watching = false;
  }
}

async function handleDownloadChange(delta) {
  await ready;
  if (
    !delta.state ||
    !["complete", "interrupted"].includes(delta.state.current)
  )
    return;
  const owner = downloadOwner(activeDownloads[delta.id]);
  if (!owner) return;
  const { tabId, jobId, filename } = owner;
  delete activeDownloads[delta.id];
  revokeDownloadURL(delta.id);
  if (delta.state.current === "interrupted") {
    await failDownload(
      tabId,
      (delta.error && delta.error.current) ||
        chrome.i18n.getMessage("downloadInterrupted"),
      jobId,
      filename,
    );
  } else if (states[tabId] && states[tabId].jobId === jobId) {
    const state = Object.assign({}, states[tabId]);
    state.pending = Math.max(0, (state.pending || 0) - 1);
    state.message = chrome.i18n.getMessage(
      state.pending
        ? "downloadInProgress"
        : state.error
          ? "downloadFinishedWithErrors"
          : "downloadComplete",
    );
    await setState(tabId, state);
  }
  await persist();
  watchQueuedItems();
}
chrome.downloads.onChanged.addListener(handleDownloadChange);

async function handleMessage(request, sender) {
  await ready;
  const tabId =
    request.type === "bookState" && sender.tab ? sender.tab.id : request.tabId;
  if (!Number.isInteger(tabId))
    throw new Error(chrome.i18n.getMessage("noActiveTab"));
  if (request.type === "bookState") {
    const previous = states[tabId];
    const previousBookId =
      previous &&
      (previous.bookId || (previous.content && previous.content.id));
    const bookId =
      request.result.bookId ||
      (request.result.content && request.result.content.id);
    const sameBook = previousBookId && previousBookId === bookId;
    if (!(
      sameBook &&
      (previous.pending ||
        previous.jobId ||
        previous.error ||
        (previous.message && !previous.loading))
    )) {
      await setState(tabId, request.result);
    }
  } else if (request.type === "getState") {
    return states[tabId] || { message: chrome.i18n.getMessage("openBookPage") };
  } else if (request.type === "download" || request.type === "refresh") {
    const existing = states[tabId];
    if (existing && existing.pending && !existing.error) return existing;
    let result;
    try {
      result = await chrome.tabs.sendMessage(tabId, { type: "readBook" });
    } catch (error) {
      result = { error: chrome.i18n.getMessage("bookPageUnavailable") };
    }
    if ((result && result.stale) || states[tabId] !== existing)
      return states[tabId] || {};
    if (!result || (!result.error && !result.content))
      result = { error: chrome.i18n.getMessage("noBookData") };
    if (request.type === "refresh") {
      // Keep a previous download failure visible until the user retries.
      if (
        existing &&
        existing.error &&
        (!result.content ||
          (existing.content && existing.content.id === result.content.id))
      )
        return existing;
      await setState(tabId, result);
      return result;
    }
    if (result.error) {
      await setState(tabId, result);
      return result;
    }
    try {
      // Only block retries of the same batch, not downloads of a new book.
      if (
        existing &&
        Object.values(activeDownloads).some((value) => {
          const owner = downloadOwner(value);
          return owner.tabId === tabId && owner.jobId === existing.jobId;
        })
      )
        throw new Error(chrome.i18n.getMessage("previousDownloadsRunning"));
      const jobId = Date.now() + "-" + ++nextJob;
      const items = bookDownloads(result.content, tabId, jobId);
      queue.push(...items);
      await setState(tabId, {
        content: result.content,
        jobId,
        pending: items.length,
        message: chrome.i18n.getMessage("downloadInProgress"),
      });
      watchQueuedItems();
    } catch (error) {
      await setState(tabId, { content: result.content, error: error.message });
    }
  }
  return states[tabId];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse, (error) => {
    console.error(chrome.i18n.getMessage("appName"), error);
    sendResponse({ error: error.message });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  // Keep state while this tab's downloads are running.
  if (
    !queue.some((item) => item.tabId === tabId) &&
    !Object.values(activeDownloads).some(
      (value) => downloadOwner(value).tabId === tabId,
    )
  ) {
    delete states[tabId];
    await persist();
  }
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  await ready;
  if (!changeInfo.url.startsWith(SITE_URL)) {
    await setState(tabId, { content: null });
    return;
  }
  // pushState can precede the DOM replacement; the loader debounces updates.
  try {
    await chrome.tabs.sendMessage(tabId, { type: "pageChanged" });
  } catch (error) {
    /* A full navigation reinjects the loader automatically. */
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "downloadQueue") watchQueuedItems();
});
chrome.runtime.onStartup.addListener(async () => {
  await ready;
  // Downloads can finish or be interrupted while the browser is shut down.
  for (const id of Object.keys(activeDownloads)) {
    const results = await chrome.downloads.search({ id: Number(id) });
    const download = results[0];
    if (!download || download.state !== "in_progress") {
      await handleDownloadChange({
        id: Number(id),
        state: { current: download ? download.state : "interrupted" },
        error: {
          current:
            (download && download.error) ||
            chrome.i18n.getMessage("downloadMissingAfterRestart"),
        },
      });
    }
  }
  watchQueuedItems();
});
