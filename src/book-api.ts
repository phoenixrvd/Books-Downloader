import { SITE_URL } from "./constants";
import { resolveAudioUrls, type AudioData } from "./audio-urls";
import type { Book } from "./types";
import type { PageSnapshot } from "./page-parser";

export interface BookData extends AudioData {
  author?: string;
  titleonly?: string;
  bookurl?: string;
}

export function readSecurityKey(document: Document): string | undefined {
  let key: string | undefined;
  for (const script of document.querySelectorAll("script:not([src])")) {
    const match = (script.textContent ?? "").match(
      /\bLIVESTREET_SECURITY_KEY\s*=\s*['"]([^'"]+)['"]/,
    );
    if (match) key = match[1];
  }
  return key;
}

interface ApiResponse extends Omit<BookData, "items"> {
  items: BookData["items"] | string;
  error?: boolean;
  bStateError?: boolean;
  token?: string;
}

export function parseBookResponse(value: ApiResponse): BookData {
  if (!value || value.error || value.bStateError)
    throw new Error("bookLoadFailed");
  const items: BookData["items"] =
    typeof value.items === "string" ? JSON.parse(value.items) : value.items;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.some(
      (item) =>
        !item ||
        (item.file !== undefined &&
          typeof item.file !== "string" &&
          typeof item.file !== "number"),
    )
  )
    throw new Error("noAudioData");
  return { ...value, items };
}

async function post(
  endpoint: string,
  data: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 20000);
  try {
    const response = await fetcher(SITE_URL + "ajax/" + endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: new URLSearchParams(data),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("bookLoadFailed");
    // Deserialize in the content realm without mutating Firefox Xray objects.
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchBook(
  bookId: string,
  securityKey: string | undefined,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<BookData> {
  if (!securityKey) throw new Error("securityKeyMissing");
  const credentials = { bid: bookId, security_ls_key: securityKey };
  const token = await post(
    "player/token",
    {
      ...credentials,
      ts: String(Date.now()),
    },
    fetcher,
    signal,
  );
  if (!token || token.error || token.bStateError || !token.token)
    throw new Error("tokenMissing");
  return parseBookResponse(
    await post(
      "b/" + bookId,
      {
        ...credentials,
        token: token.token,
        hls: "false",
      },
      fetcher,
      signal,
    ),
  );
}

export function prepareBook(page: PageSnapshot, data: BookData): Book {
  return {
    id: page.id,
    author: (data.author || "").trim(),
    title: (data.titleonly || "").trim(),
    description: page.description,
    metadata: page.metadata.map(({ label, value }) =>
      label ? `${label}: ${value}` : value,
    ),
    metadataFields: page.metadata,
    image: page.image,
    source: data.bookurl,
    files: resolveAudioUrls(page.id, data),
  };
}
