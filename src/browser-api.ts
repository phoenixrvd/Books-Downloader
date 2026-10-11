declare const browser: typeof chrome | undefined;

export type BrowserApi = typeof chrome;

export function availableBrowser(): BrowserApi | undefined {
  if (typeof browser !== "undefined") return browser;
  return typeof chrome !== "undefined" ? chrome : undefined;
}

export function browserApi(): BrowserApi {
  const api = availableBrowser();
  if (!api) throw new Error("Browser API unavailable");
  return api;
}
