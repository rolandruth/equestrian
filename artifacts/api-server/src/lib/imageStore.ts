import { randomUUID } from "crypto";
import { lookup } from "dns/promises";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { BlockList, isIP } from "net";
import sharp from "sharp";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

const IMAGE_KEY_RE = /^(listingimage|image\d+)$/;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_ANIMATED_IMAGE_PIXELS = 80_000_000;
const MAX_ANIMATION_PAGES = 200;
const MAX_IMAGE_WIDTH = 1600;
const MAX_IMAGE_HEIGHT = 1200;
const FETCH_TIMEOUT_MS = 25_000;
const PUBLIC_LISTING_IMAGE_PREFIX = "/api/storage/public-objects/listing-images/";
const OPTIMIZED_LISTING_IMAGE_PREFIX = `${PUBLIC_LISTING_IMAGE_PREFIX}optimized/`;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const TYPE_BY_FORMAT: Record<string, { contentType: string; extension: string }> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
  gif: { contentType: "image/gif", extension: "gif" },
  avif: { contentType: "image/avif", extension: "avif" },
};

export interface ListingImageTarget {
  key: string;
  value: string;
  source: "remote" | "stored" | "paid";
}

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

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

function isLegacyStoredListingImage(value: string): boolean {
  return value.startsWith(PUBLIC_LISTING_IMAGE_PREFIX) && !value.startsWith(OPTIMIZED_LISTING_IMAGE_PREFIX);
}

export function getListingImageTargets(customFields: Record<string, unknown> | null): ListingImageTarget[] {
  if (!customFields) return [];
  const targets: ListingImageTarget[] = [];
  for (const [key, value] of Object.entries(customFields)) {
    if (!IMAGE_KEY_RE.test(key) || typeof value !== "string") continue;
    if (isRemoteImageUrl(value)) {
      targets.push({ key, value, source: isPaidApiImageUrl(value) ? "paid" : "remote" });
    } else if (isLegacyStoredListingImage(value)) {
      targets.push({ key, value, source: "stored" });
    }
  }
  return targets;
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

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedAddresses.check(address, "ipv4");
  if (family === 6) return blockedAddresses.check(address, "ipv6");
  return true;
}

/** SSRF guard: only plain http(s) on default ports to public IPs. */
async function resolveSafeUrl(rawUrl: string): Promise<{ url: URL; address: string; family: 4 | 6 }> {
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
  const host = normalizeHostname(url.hostname);
  const literalFamily = isIP(host);
  if (literalFamily) {
    if (isBlockedAddress(host)) throw new Error("Private or special-use IP blocked");
    return { url, address: host, family: literalFamily as 4 | 6 };
  }
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0 || addrs.some((result) => isBlockedAddress(result.address))) {
    throw new Error("Host resolves to a private or special-use address");
  }
  const selected = addrs[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

const MAX_REDIRECTS = 3;

type PinnedImageResponse =
  | { redirect: string }
  | { buf: Buffer; contentType: string }
  | null;

/**
 * Requests the already-resolved public address while preserving the original
 * Host header and TLS server name. This prevents a second DNS lookup from
 * rebinding the request to a private service after validation.
 */
async function requestPinnedImage(
  url: URL,
  address: string,
  family: 4 | 6,
): Promise<PinnedImageResponse> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: PinnedImageResponse) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address,
        family,
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: url.protocol === "https:" ? normalizeHostname(url.hostname) : undefined,
        headers: {
          Host: url.host,
          Accept: "image/jpeg,image/png,image/webp,image/gif,image/avif",
          "User-Agent": "DirectoryMaster-ImageOptimizer/1.0",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const location = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location;
          response.resume();
          finish(location ? { redirect: location } : null);
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          finish(null);
          return;
        }

        const rawContentType = Array.isArray(response.headers["content-type"])
          ? response.headers["content-type"][0]
          : response.headers["content-type"];
        const contentType = (rawContentType ?? "").split(";")[0].trim().toLowerCase();
        const declared = Number(response.headers["content-length"] ?? 0);
        if (!EXT_BY_TYPE[contentType] || declared > MAX_IMAGE_BYTES) {
          response.resume();
          finish(null);
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > MAX_IMAGE_BYTES) {
            response.destroy();
            finish(null);
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          finish(total > 0 ? { buf: Buffer.concat(chunks), contentType } : null);
        });
        response.on("error", () => finish(null));
      },
    );
    request.setTimeout(FETCH_TIMEOUT_MS, () => {
      request.destroy();
      finish(null);
    });
    request.on("error", () => finish(null));
    request.end();
  });
}

/** Fetch with per-hop SSRF validation, DNS pinning, and a streaming size cap. */
async function fetchImageSafely(rawUrl: string): Promise<{ buf: Buffer; contentType: string } | null> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const resolved = await resolveSafeUrl(current);
    const response = await requestPinnedImage(resolved.url, resolved.address, resolved.family);
    if (!response) return null;
    if ("redirect" in response) {
      current = new URL(response.redirect, current).toString();
      continue;
    }
    return response;
  }
  return null;
}

export async function optimizeListingImageBuffer(input: Buffer): Promise<OptimizedImage | null> {
  try {
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: true,
    }).metadata();
    const source = metadata.format ? TYPE_BY_FORMAT[metadata.format] : undefined;
    if (!source || !metadata.width || !metadata.height) return null;
    const pages = metadata.pages ?? 1;
    const pageHeight = metadata.pageHeight ?? metadata.height;
    if (
      pages > MAX_ANIMATION_PAGES ||
      metadata.width * pageHeight * pages > MAX_ANIMATED_IMAGE_PIXELS
    ) return null;

    const buffer = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
      animated: pages > 1,
    })
      .rotate()
      .resize({
        width: MAX_IMAGE_WIDTH,
        height: MAX_IMAGE_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toBuffer();

    return { buffer, contentType: "image/webp", extension: "webp" };
  } catch (err) {
    logger.warn({ err }, "Listing image optimization rejected invalid image data");
    return null;
  }
}

async function saveOptimizedListingImage(image: OptimizedImage): Promise<string> {
  const { bucketName, basePath } = getPublicDir();
  const relativeKey = `listing-images/optimized/${randomUUID()}.${image.extension}`;
  const objectName = basePath ? `${basePath}/${relativeKey}` : relativeKey;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(image.buffer, {
    contentType: image.contentType,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { optimized: "listing-image-v1" },
    },
  });
  return `/api/storage/public-objects/${relativeKey}`;
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
    const optimized = await optimizeListingImageBuffer(result.buf);
    if (!optimized) {
      logger.warn({ url: url.slice(0, 120), contentType: result.contentType }, "Image bytes could not be optimized");
      return null;
    }
    return await saveOptimizedListingImage(optimized);
  } catch (err) {
    logger.warn({ err, url: url.slice(0, 120) }, "Image mirror error");
    return null;
  }
}

async function optimizeStoredListingImage(value: string): Promise<string | null> {
  try {
    const relativeKey = value.slice("/api/storage/public-objects/".length);
    if (!relativeKey.startsWith("listing-images/")) return null;
    const { bucketName, basePath } = getPublicDir();
    const objectName = basePath ? `${basePath}/${relativeKey}` : relativeKey;
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [metadata] = await file.getMetadata();
    const declaredSize = Number(metadata.size ?? 0);
    if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_IMAGE_BYTES) return null;
    const [buffer] = await file.download();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) return null;
    const optimized = await optimizeListingImageBuffer(buffer);
    if (!optimized) return null;
    return await saveOptimizedListingImage(optimized);
  } catch (err) {
    logger.warn({ err, value: value.slice(0, 160) }, "Stored listing image optimization failed");
    return null;
  }
}

export async function optimizeListingImageTarget(target: ListingImageTarget): Promise<string | null> {
  if (target.source === "paid") return null;
  return target.source === "remote"
    ? mirrorImageToStorage(target.value)
    : optimizeStoredListingImage(target.value);
}

export async function deleteOptimizedListingImage(value: string): Promise<void> {
  if (!value.startsWith(OPTIMIZED_LISTING_IMAGE_PREFIX)) return;
  const relativeKey = value.slice("/api/storage/public-objects/".length);
  const { bucketName, basePath } = getPublicDir();
  const objectName = basePath ? `${basePath}/${relativeKey}` : relativeKey;
  await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
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
    if (!IMAGE_KEY_RE.test(key) || typeof value !== "string" || !isRemoteImageUrl(value)) continue;
    if (isPaidApiImageUrl(value)) {
      // Never call or retain key-bearing paid API image URLs.
      delete updated[key];
      changed = true;
      continue;
    }
    const localPath = await mirrorImageToStorage(value);
    if (localPath) {
      updated[key] = localPath;
      changed = true;
    }
  }
  return { fields: updated, changed };
}
