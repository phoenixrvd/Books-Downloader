import CryptoJS from "crypto-js/core";
import AES from "crypto-js/aes";

export interface AudioData {
  res?: string;
  version?: number;
  srv?: string;
  key?: string;
  slug?: string | number;
  title?: string;
  items: { file?: string | number }[];
}

// The JSON formatter's parse method is part of password-based AES decryption.
const formatter: typeof CryptoJS.format.OpenSSL = {
  stringify(params) {
    return JSON.stringify({
      ct: params.ciphertext.toString(CryptoJS.enc.Base64),
      ...(params.iv ? { iv: params.iv.toString() } : {}),
      ...(params.salt ? { s: params.salt.toString() } : {}),
    });
  },
  parse(text) {
    const value: { ct: string; iv?: string; s?: string } = JSON.parse(text);
    return CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(value.ct),
      iv: value.iv ? CryptoJS.enc.Hex.parse(value.iv) : undefined,
      salt: value.s ? CryptoJS.enc.Hex.parse(value.s) : undefined,
    });
  },
};

export function adjacentUnique(items: (string | number)[]): string[] {
  const unique: (string | number)[] = [];
  for (const item of items) {
    const previous = unique.at(-1);
    // Preserve numeric/string comparisons without globally deduplicating tracks.
    if (!unique.length || item != previous) unique.push(item);
  }
  return unique.map(String);
}

export function resolveAudioUrls(bookId: string, data: AudioData): string[] {
  let urls: string[];
  if (data.res) {
    const value: unknown = JSON.parse(
      AES.decrypt(data.res, "EKxtcg46V", {
        format: formatter,
      }).toString(CryptoJS.enc.Utf8),
    );
    if (typeof value !== "string") throw new Error("invalidAudioURL");
    urls = [value + ((data.version ?? 0) > 1 ? `&v=${data.version}` : "")];
  } else {
    if (!data.srv || !data.key) throw new Error("invalidAudioURL");
    const base = `${data.srv}b/${bookId}/${data.key}/`;
    if (data.slug != null) urls = [`${base}${data.slug}.mp3`];
    else {
      if (
        typeof data.title !== "string" ||
        data.items.some((item) => item.file == null)
      )
        throw new Error("invalidAudioURL");
      urls = adjacentUnique(data.items.map((item) => item.file!)).map(
        (file) => `${base}${file.padStart(2, "0")}. ${data.title}.mp3`,
      );
    }
  }
  if (
    !urls.length ||
    urls.some(
      (url) =>
        !["https:", "http:"].includes(new URL(url).protocol) ||
        url.includes("/undefined/"),
    )
  )
    throw new Error("invalidAudioURL");
  return urls;
}
