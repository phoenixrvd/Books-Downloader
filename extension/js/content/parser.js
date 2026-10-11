function loadBookData(onSuccess, onError) {
  var bookId = getBookId();

  if (typeof bookId === "undefined") {
    onSuccess(null);
    return;
  }

  requestBookData(
    bookId,
    (content) => {
      try {
        if (getBookId() !== bookId) {
          const error = new Error(chrome.i18n.getMessage("bookChanged"));
          error.code = "STALE_PAGE";
          throw error;
        }
        const pageData = preparePageData(content);
        if (
          !pageData.files.length ||
          pageData.files.some(
            (url) => !/^https?:\/\//.test(url) || url.includes("/undefined/"),
          )
        ) {
          throw new Error(chrome.i18n.getMessage("invalidAudioURL"));
        }
        onSuccess(pageData);
      } catch (error) {
        onError(error);
      }
    },
    onError,
  );
}

// the encryption key is taken from the webpage's js file and seems to be static
const encryptionKey = "EKxtcg46V";

// Makes an AJAX request to get information about the book with `bookId`.
// `onSuccess` is called if the request has succeeded, its parameter is parsed JSON response.
function requestBookData(bookId, onSuccess, onError) {
  // note: `LIVESTREET_SECURITY_KEY` is set in the HTML page and it's correlated with the user's cookie
  // the request below works because the browser sends the user's cookie along with our data
  const securityKey = retrieveWindowVariables([
    "LIVESTREET_SECURITY_KEY",
  ]).LIVESTREET_SECURITY_KEY;
  const fail = (error) =>
    onError(
      error instanceof Error
        ? error
        : new Error(chrome.i18n.getMessage("bookLoadFailed")),
    );
  if (!securityKey) {
    fail(new Error(chrome.i18n.getMessage("securityKeyMissing")));
    return;
  }
  const post = async (endpoint, data) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(SITE_URL + "ajax/" + endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
        },
        body: new URLSearchParams({ security_ls_key: securityKey, ...data }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(chrome.i18n.getMessage("bookLoadFailed"));
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
  post("player/token", { bid: bookId, ts: Date.now() })
    .then((result) => {
      if (!result || result.error || result.bStateError || !result.token) {
        fail(new Error(chrome.i18n.getMessage("tokenMissing")));
        return;
      }
      post("b/" + bookId, { bid: bookId, token: result.token, hls: "false" })
        .then((response) => {
          try {
            if (!response || response.error || response.bStateError) {
              throw new Error(chrome.i18n.getMessage("bookLoadFailed"));
            }
            response.items =
              typeof response.items === "string"
                ? JSON.parse(response.items)
                : response.items;
            if (!Array.isArray(response.items) || !response.items.length) {
              throw new Error(chrome.i18n.getMessage("noAudioData"));
            }
            onSuccess(response);
          } catch (error) {
            fail(error);
          }
        })
        .catch(fail);
    })
    .catch(fail);
}

function getBookId() {
  return (
    document.querySelector("article")?.getAttribute("data-bid") ?? undefined
  );
}

function getBookCover() {
  return (
    document.querySelector("article .book--cover img")?.getAttribute("src") ??
    undefined
  );
}

function getURLs(bookId, data) {
  // now (most?) books use this newer way of getting the URL
  // for example: https://akniga.org/azimov-ayzek-mesto-gde-mnogo-vody-3
  if (data.res) {
    // this is adapted from the website's javascript code
    const fileVersion = data.version > 1 ? `&v=${data.version}` : "";
    // `JSON.parse` is needed because the encrypted url is json-encoded
    // (wrapped in quotes and contains escaped slashes)
    const fileURL =
      JSON.parse(
        CryptoJS.AES.decrypt(data.res, encryptionKey, {
          format: JsonFormatter,
        }).toString(CryptoJS.enc.Utf8),
      ) + fileVersion;
    return [fileURL];
  }

  if (!data.srv || !data.key) {
    throw new Error(chrome.i18n.getMessage("invalidAudioURL"));
  }
  const baseURL = `${data.srv}b/${bookId}/${data.key}/`;

  const newURLFormat = data.slug != null;

  return newURLFormat
    ? // this previous "new URL format" seems to be broken because there is no
      // `key` even if there is `slug`
      // (previous example: 58 hours — https://akniga.org/tolstoy-lev-voyna-i-mir-1
      // now uses the `res` value above)
      [`${baseURL}${data.slug}.mp3`]
    : // but some longer books use the old, multi-file format,
      // for example: 92.5 hours — https://akniga.org/zolotoy-fond-radiospektakley-chast-1-sbornik-audiospektakley
      data.items
        .map((item) => item.file)
        .nub()
        .map((file) => {
          // note: filenames have a two-digit one-based index
          const index = file.toString().padStart(2, "0");
          return `${baseURL}${index}. ${data.title}.mp3`;
        });
}

// Removes sequentially-duplicated values leaving only the first from each group.
// E.g. `[1, 1, 1, 2, 2, 3, 1, 4, 4].nub() == [1, 2, 3, 1, 4]`.
Array.prototype.nub = function () {
  return this.reduce(function (acc, item) {
    if (acc.length == 0) {
      return [item];
    } else {
      const previousItem = acc[acc.length - 1];
      if (item == previousItem) {
        return acc;
      } else {
        return acc.concat(item);
      }
    }
  }, []);
};

function preparePageData(response) {
  const bookId = getBookId();

  const data = {
    id: bookId,
    author: (response.author || "").trim(),
    title: (response.titleonly || "").trim(),
    description: getDescriptionText(),
    metadata: getMetaData().filter((v) => v),
    image: getBookCover(),
    source: response.bookurl,
    files: getURLs(bookId, response),
  };

  return data;
}

function getDescriptionTextMobile() {
  const description = document.querySelector(".topic-content")?.cloneNode(true);
  if (!description) return "";
  description
    .querySelectorAll(".topic-content-right,.ya-share2")
    .forEach((element) => element.remove());
  return description.textContent.trim();
}

function getMetaDataMobile() {
  const meta = document.querySelector(".book-info")?.cloneNode(true);
  if (!meta) return [];
  meta.querySelectorAll(".fa").forEach((element) => element.remove());
  return Array.from(meta.querySelectorAll(".item-info"), (item) =>
    item.textContent.trim().replace(/\s+/, " "),
  );
}

function getDescriptionText() {
  const desc = document
    .querySelector(
      "article .description__article-main:not(.caption__article--about-block-samebook)",
    )
    ?.cloneNode(true);
  if (!desc) return "";
  desc.querySelectorAll("div").forEach((element) => element.remove());
  return desc.textContent.trim();
}

function getMetaData() {
  // this should select the top metadata fields (Author, Performer, Rating, Duration, optional Year)
  // except for Alternative performances
  const about = document.querySelectorAll(
    ".caption__article--about-block:not(.caption__article--about-block-samebook)",
  );
  const metadata = Array.from(about, (div) => {
    const copy = div.cloneNode(true);
    copy
      .querySelectorAll(".tooltip__main")
      .forEach((element) => element.remove());
    return copy.textContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(": ");
  });

  const classifiers = [
    Array.from(document.querySelectorAll("article .classifiers__article-main"))
      .map((element) => element.textContent)
      .join("")
      .trim()
      .replace(/ +/g, " "),
  ];

  return metadata.concat(classifiers);
}

if (document.querySelector(".layout--template-acl10-mobile")) {
  getDescriptionText = getDescriptionTextMobile;
  getMetaData = getMetaDataMobile;
}

// --8<--
// External code

// Allows the extension script to retrieve variables defined on the webpage
// where the extension is embedded.
// Source: https://stackoverflow.com/questions/3955803/chrome-extension-get-page-variables-in-content-script/24344154#24344154
function retrieveWindowVariables(variables) {
  var ret = {};

  // Read the page's inline configuration without injecting executable code
  // (inline injection can be blocked by the page's CSP).
  const scripts = Array.from(document.querySelectorAll("script:not([src])"));
  for (const variable of variables) {
    if (variable !== "LIVESTREET_SECURITY_KEY") continue;
    for (const script of scripts) {
      const match = script.textContent.match(
        /\bLIVESTREET_SECURITY_KEY\s*=\s*['"]([^'"]+)['"]/,
      );
      if (match) ret[variable] = match[1];
    }
  }
  return ret;
}

// Formatter to store `CipherParams`'s properties (Base64-encoded `ciphertext`,
// `iv` and `salt`) as a JSON object.
// Note: the `parse` function is actually unused in the code because the script
// doesn't need to decrypt a response.
// Source: https://cryptojs.gitbook.io/docs/#the-cipher-output
var JsonFormatter = {
  stringify: function (cipherParams) {
    // create json object with ciphertext
    var jsonObj = { ct: cipherParams.ciphertext.toString(CryptoJS.enc.Base64) };

    // optionally add iv or salt
    if (cipherParams.iv) {
      jsonObj.iv = cipherParams.iv.toString();
    }

    if (cipherParams.salt) {
      jsonObj.s = cipherParams.salt.toString();
    }

    // stringify json object
    return JSON.stringify(jsonObj);
  },
  parse: function (jsonStr) {
    // parse json string
    var jsonObj = JSON.parse(jsonStr);

    // extract ciphertext from json object, and create cipher params object
    var cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(jsonObj.ct),
    });

    // optionally extract iv or salt

    if (jsonObj.iv) {
      cipherParams.iv = CryptoJS.enc.Hex.parse(jsonObj.iv);
    }

    if (jsonObj.s) {
      cipherParams.salt = CryptoJS.enc.Hex.parse(jsonObj.s);
    }

    return cipherParams;
  },
};
