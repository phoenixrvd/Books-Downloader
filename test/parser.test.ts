import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { adjacentUnique, resolveAudioUrls } from "../src/audio-urls";
import {
  fetchBook,
  parseBookResponse,
  prepareBook,
  readSecurityKey,
} from "../src/book-api";
import { parsePage } from "../src/page-parser";

const cipher = JSON.stringify({
  ct: "7m5qOH/+HxlFMxxnmkfgMiH2m2JtemecNMlBSVH+3C7tY71vrHZyOqJ1U7yOXQxJ",
  iv: "8a3d045e5b8f482b6a6377d75d26b373",
  s: "0011223344556677",
});

for (const layout of ["desktop", "mobile"]) {
  it(`parses ${layout} reference metadata through direct imports`, () => {
    const dom = new JSDOM(readFileSync(`test/fixtures/${layout}.html`, "utf8"));
    try {
      const page = parsePage(dom.window.document)!;
      assert.equal(page.id, "50768");
      assert.equal(
        page.image,
        "https://akniga.org/uploads/media/topic/2019/06/28/11/preview/821258151e502731e8c6_400x.jpg",
      );
      assert.equal(
        page.description,
        "На пустынном Марсе три человека нашли арсенал с оружием… Им бы задуматься — почему на Марсе нет живых существ?",
      );
      assert.deepEqual(page.metadata[0], {
        label: "Автор",
        value: "Шекли Роберт",
      });
      assert.deepEqual(page.metadata[1], {
        label: "Исполнитель",
        value: "Карлов Александр",
      });
      assert.deepEqual(page.metadata[3], {
        label: "Длительность",
        value: "24 минуты",
      });
      if (layout === "desktop") {
        assert.deepEqual(page.metadata[4], { label: "Год", value: "2015" });
        assert.equal(page.metadata.length, 5);
      }
      const book = prepareBook(page, {
        srv: "https://audio.example/",
        key: "key",
        title: "Book",
        items: [{ file: 1 }],
      });
      assert.equal(book.id, "50768");
      assert.equal(book.metadata[0], "Автор: Шекли Роберт");
      assert.deepEqual(book.metadataFields, page.metadata);
      assert.equal(
        book.files[0],
        "https://audio.example/b/50768/key/01. Book.mp3",
      );
    } finally {
      dom.window.close();
    }
  });
}

it("handles absent pages, empty metadata and layout changes on each read", () => {
  const dom = new JSDOM("");
  try {
    assert.equal(parsePage(dom.window.document), null);
    dom.window.document.body.innerHTML = '<article data-bid="123"></article>';
    assert.deepEqual(parsePage(dom.window.document), {
      id: "123",
      description: "",
      metadata: [],
    });
    dom.window.document.body.className = "layout--template-acl10-mobile";
    dom.window.document.body.innerHTML +=
      '<div class="topic-content">Mobile</div>';
    assert.equal(parsePage(dom.window.document)?.description, "Mobile");
  } finally {
    dom.window.close();
  }
});

it("decrypts the fixed reference ciphertext and preserves version suffixes", () => {
  assert.deepEqual(resolveAudioUrls("123", { res: cipher, items: [{}] }), [
    "https://audio.example/book.mp3?res=test",
  ]);
  assert.deepEqual(
    resolveAudioUrls("123", { res: cipher, version: 2, items: [{}] }),
    ["https://audio.example/book.mp3?res=test&v=2"],
  );
  for (const res of ["broken", "{}", '{"ct":"invalid!"}'])
    assert.throws(() => resolveAudioUrls("123", { res, items: [{}] }));
});

it("resolves slug and multi-file variants, normalizing only adjacent duplicate indices", () => {
  const data = {
    srv: "https://audio.example/",
    key: "key",
    title: "Book",
    items: [{ file: 1 }, { file: "1" }, { file: 2 }, { file: 1 }],
  };
  assert.deepEqual(adjacentUnique([1, "1", 2, 2, 3, 1]), ["1", "2", "3", "1"]);
  assert.deepEqual(adjacentUnique([1, "01", "1", 2]), ["1", "2"]);
  assert.deepEqual(adjacentUnique(["01", "1"]), ["01", "1"]);
  assert.deepEqual(
    resolveAudioUrls("123", data),
    ["01", "02", "01"].map(
      (index) => `https://audio.example/b/123/key/${index}. Book.mp3`,
    ),
  );
  assert.deepEqual(resolveAudioUrls("123", { ...data, slug: "chapter" }), [
    "https://audio.example/b/123/key/chapter.mp3",
  ]);
  assert.throws(
    () => resolveAudioUrls("123", { ...data, key: undefined }),
    /invalidAudioURL/,
  );
  assert.throws(
    () => resolveAudioUrls("123", { ...data, srv: "javascript:" }),
    /invalidAudioURL/,
  );
});

it("parses API audio items", () => {
  const response = {
    srv: "https://audio.example/",
    key: "key",
    title: "Book",
    items: '[{"file":1}]',
  };
  const parsed = parseBookResponse(response);
  assert.deepEqual(parsed.items, [{ file: 1 }]);
  assert.equal(typeof response.items, "string");
  assert.deepEqual(parseBookResponse({ items: [{ file: 1 }] }).items, [
    { file: 1 },
  ]);
  for (const value of [
    null,
    { error: true },
    { items: "broken" },
    { items: [] },
    { items: [null] },
    { items: [{ file: {} }] },
  ])
    assert.throws(() =>
      parseBookResponse(value as Parameters<typeof parseBookResponse>[0]),
    );
});

it("reads configuration without executing scripts and requests token/book with the original cookie context", async () => {
  const dom = new JSDOM(
    '<script>var LIVESTREET_SECURITY_KEY="key";</script><article data-bid="123"></article>',
  );
  try {
    const requests: { url: string; options: RequestInit }[] = [];
    const fetcher: typeof fetch = async (url, options) => {
      requests.push({ url: String(url), options: options! });
      return new Response(
        JSON.stringify(
          String(url).endsWith("player/token")
            ? { token: "token" }
            : { res: cipher, items: '[{"file":1}]', titleonly: "Book" },
        ),
      );
    };
    const key = readSecurityKey(dom.window.document);
    assert.equal(key, "key");
    const data = await fetchBook("123", key, fetcher);
    assert.equal(data.titleonly, "Book");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.credentials, "same-origin");
    assert.equal(
      (requests[0].options.headers as Record<string, string>)[
        "X-Requested-With"
      ],
      "XMLHttpRequest",
    );
    const body = requests[1].options.body as URLSearchParams;
    assert.equal(body.get("token"), "token");
    assert.equal(body.get("security_ls_key"), "key");
    assert.equal(body.get("hls"), "false");
  } finally {
    dom.window.close();
  }
});

it("rejects missing configuration, HTTP errors, malformed JSON and missing tokens", async () => {
  await assert.rejects(fetchBook("123", undefined), /securityKeyMissing/);
  await assert.rejects(
    fetchBook("123", "key", async () => new Response("", { status: 403 })),
    /bookLoadFailed/,
  );
  await assert.rejects(
    fetchBook("123", "key", async () => new Response("not JSON")),
  );
  await assert.rejects(
    fetchBook("123", "key", async () => new Response('{"error":true}')),
    /tokenMissing/,
  );
});

it("forwards navigation aborts to HTTP requests", async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options!.signal!.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      );
    });
  const pending = fetchBook("123", "key", fetcher, controller.signal);
  controller.abort();
  await assert.rejects(pending, /aborted/);
});
