import type { Book, QueueEntry } from "./types";

export function replacePathChars(path: string, fallback: string): string {
  return (
    path
      .replace(/[~!@#$%^&*()_|+=?;:'"<>\{\}\[\]\\\/`\x00-\x1f]/g, "_")
      .replace(/^[. ]+|[. ]+$/g, "") || fallback
  );
}

export function textURL(text: string, type = "text/plain"): string {
  return "data:" + type + ";charset=UTF-8," + encodeURIComponent(text);
}

export function bookDownloads(
  content: Book,
  tabId: number,
  jobId: string,
  fallback: string,
): QueueEntry[] {
  if (!content.files.length) throw new Error("invalidAudioURL");
  const directory = replacePathChars(
    content.author ? content.author + " - " + content.title : content.title,
    fallback,
  );
  const items: QueueEntry[] = [];
  function add(filename: string, url: string) {
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
  content.files.forEach((url, index) => {
    const parsed = new URL(url);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      url.includes("/undefined/")
    )
      throw new Error("invalidAudioURL");
    const basename = parsed.pathname.substring(
      parsed.pathname.lastIndexOf("/") + 1,
    );
    add(replacePathChars(basename || index + 1 + ".mp3", fallback), url);
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
