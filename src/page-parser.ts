import type { MetadataField } from "./types";

export interface PageSnapshot {
  id: string;
  description: string;
  metadata: MetadataField[];
  image?: string;
}

export function getBookId(document: Document): string | undefined {
  return (
    document.querySelector("article")?.getAttribute("data-bid") ?? undefined
  );
}

function clone(document: Document, selector: string): Element | undefined {
  return document.querySelector(selector)?.cloneNode(true) as
    Element | undefined;
}

export function parsePage(document: Document): PageSnapshot | null {
  const id = getBookId(document);
  if (id === undefined) return null;
  const mobile = !!document.querySelector(".layout--template-acl10-mobile");
  const image = document
    .querySelector("article .book--cover img")
    ?.getAttribute("src");
  const metadata = mobile
    ? readMobileMetadata(document)
    : readDesktopMetadata(document);
  return {
    id,
    description: readDescription(document, mobile),
    metadata: metadata.filter((field) => field.value),
    ...(image == null ? {} : { image }),
  };
}

function readDescription(document: Document, mobile: boolean): string {
  const description = clone(
    document,
    mobile
      ? ".topic-content"
      : "article .description__article-main:not(.caption__article--about-block-samebook)",
  );
  description
    ?.querySelectorAll(mobile ? ".topic-content-right,.ya-share2" : "div")
    .forEach((node) => node.remove());
  return (description?.textContent ?? "").trim();
}

function text(element: Element | null): string {
  return (element?.textContent ?? "").trim().replace(/\s+/g, " ");
}

function labeledText(value: string): MetadataField {
  const colon = value.indexOf(":");
  if (colon < 0) return { label: "", value };
  return {
    label: value.slice(0, colon).trim(),
    value: value.slice(colon + 1).trim(),
  };
}

function readMobileMetadata(document: Document): MetadataField[] {
  const meta = clone(document, ".book-info");
  if (!meta) return [];
  meta.querySelectorAll(".fa").forEach((node) => node.remove());
  return Array.from(meta.querySelectorAll(".item-info"), (node) =>
    labeledText(text(node)),
  );
}

function readDesktopMetadata(document: Document): MetadataField[] {
  const fields = document.querySelectorAll(
    ".caption__article--about-block:not(.caption__article--about-block-samebook)",
  );
  const metadata: MetadataField[] = [];
  for (const field of fields) {
    const copy = field.cloneNode(true) as Element;
    copy.querySelectorAll(".tooltip__main").forEach((node) => node.remove());
    metadata.push({
      label: text(
        copy.querySelector(".content__main__book--item--caption"),
      ).replace(/:$/, ""),
      value: text(copy.querySelector(".content__article--about-content")),
    });
  }
  return metadata;
}
