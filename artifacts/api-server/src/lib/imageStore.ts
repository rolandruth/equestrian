import { randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

const IMAGE_KEY_RE = /^(listingimage|image\d+)$/;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function getPublicDir(): { bucketName: string; basePath: string } {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = pathsStr.split(",").map((p) => p.trim()).filter(Boolean)[0];
  if (!first) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  const parts = first.replace(/^\//, "").split("/");
  return { bucketName: parts[0], basePath: parts.slice(1).join("/") };
}

export function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && !value.startsWith("/api/storage/");
}

/** True when this URL hot-links a paid / key-bearing API we must never keep. */
export function isPaidApiImageUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "maps.googleapis.com" || host.endsWith(".googleapis.com");
  } catch {
    return false;
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    return (
      low === "::1" || low === "::" ||
      low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd") ||
      low.startsWith("::ffff:127.") || low.startsWith("::ffff:10.") ||
      low.startsWith("::ffff:192.168.") || low.startsWith("::ffff:169.254.")
    );
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** SSRF guard: only plain http(s) on default ports to public IPs. */
async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Non-standard port blocked");
  }
  if (url.username || url.password) {
    throw new Error("Credentials in URL blocked");
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private IP blocked");
    return url;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Host resolves to private address");
  }
  return url;
}

const MAX_REDIRECTS = 3;

/** Fetch with per-hop SSRF validation and a streaming size cap. */
async function fetchImageSafely(rawUrl: string): Promise<{ buf: Buffer; contentType: string } | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current);
    const resp = await fetch(current, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, current).toString();
      continue;
    }
    if (!resp.ok) return null;
    const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!EXT_BY_TYPE[contentType]) return null;
    const declared = Number(resp.headers.get("content-length") || 0);
    if (declared > MAX_IMAGE_BYTES) return null;
    if (!resp.body) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (total === 0) return null;
    return { buf: Buffer.concat(chunks), contentType };
  }
  return null;
}

/**
 * Downloads a remote image and stores it in public object storage.
 * Returns the app-relative serving path, or null if the download failed.
 */
export async function mirrorImageToStorage(url: string): Promise<string | null> {
  try {
    const result = await fetchImageSafely(url);
    if (!result) {
      logger.warn({ url: url.slice(0, 120) }, "Image download rejected or failed");
      return null;
    }
    const { buf, contentType } = result;
    const ext = EXT_BY_TYPE[contentType];

    const { bucketName, basePath } = getPublicDir();
    const relativeKey = `listing-images/${randomUUID()}.${ext}`;
    const objectName = basePath ? `${basePath}/${relativeKey}` : relativeKey;
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buf, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });

    return `/api/storage/public-objects/${relativeKey}`;
  } catch (err) {
    logger.warn({ err, url: url.slice(0, 120) }, "Image mirror error");
    return null;
  }
}

/**
 * Mirrors all remote image URLs found in an entry's customFields.
 * Returns the updated fields and whether anything changed.
 */
export async function mirrorEntryImages(
  customFields: Record<string, unknown> | null,
): Promise<{ fields: Record<string, unknown> | null; changed: boolean }> {
  if (!customFields) return { fields: customFields, changed: false };
  let changed = false;
  const updated: Record<string, unknown> = { ...customFields };
  for (const [key, value] of Object.entries(customFields)) {
    if (!IMAGE_KEY_RE.test(key)) continue;
    if (typeof value !== "string" || !isRemoteImageUrl(value)) continue;
    const localPath = await mirrorImageToStorage(value);
    if (localPath) {
      updated[key] = localPath;
      changed = true;
    } else if (isPaidApiImageUrl(value)) {
      // Never keep paid / API-key-bearing URLs around — drop the field
      // rather than hot-link a billable endpoint.
      delete updated[key];
      changed = true;
    }
  }
  return { fields: updated, changed };
}
