import assert from "node:assert/strict";
import sharp from "sharp";
import {
  getListingImageTargets,
  optimizeListingImageBuffer,
} from "../lib/imageStore";

const source = await sharp({
  create: {
    width: 3000,
    height: 2000,
    channels: 3,
    background: { r: 98, g: 126, b: 82 },
  },
})
  .jpeg({ quality: 95 })
  .toBuffer();

const optimized = await optimizeListingImageBuffer(source);
assert.ok(optimized);
assert.equal(optimized.contentType, "image/webp");
assert.equal(optimized.extension, "webp");
assert.ok(optimized.buffer.byteLength < source.byteLength);

const metadata = await sharp(optimized.buffer).metadata();
assert.ok((metadata.width ?? 0) <= 1600);
assert.ok((metadata.height ?? 0) <= 1200);
assert.equal(metadata.format, "webp");

const orientedSource = await sharp({
  create: {
    width: 120,
    height: 60,
    channels: 3,
    background: { r: 42, g: 84, b: 126 },
  },
})
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();
const oriented = await optimizeListingImageBuffer(orientedSource);
assert.ok(oriented);
const orientedMetadata = await sharp(oriented.buffer).metadata();
assert.equal(orientedMetadata.width, 60);
assert.equal(orientedMetadata.height, 120);

const gifSource = await sharp({
  create: {
    width: 40,
    height: 20,
    channels: 4,
    background: { r: 120, g: 80, b: 40, alpha: 1 },
  },
}).gif().toBuffer();
const gifOptimized = await optimizeListingImageBuffer(gifSource);
assert.ok(gifOptimized);
assert.equal(gifOptimized.contentType, "image/webp");
assert.equal((await sharp(gifOptimized.buffer).metadata()).format, "webp");

assert.equal(await optimizeListingImageBuffer(Buffer.from("not an image")), null);

assert.deepEqual(
  getListingImageTargets({
    listingimage: "https://example.com/horse.jpg",
    image2: "/api/storage/public-objects/listing-images/legacy.jpg",
    image3: "/api/storage/public-objects/listing-images/optimized/already.webp",
    image4: "https://maps.googleapis.com/maps/api/staticmap?key=hidden",
    title: "Not an image",
  }),
  [
    { key: "listingimage", value: "https://example.com/horse.jpg", source: "remote" },
    { key: "image2", value: "/api/storage/public-objects/listing-images/legacy.jpg", source: "stored" },
    { key: "image4", value: "https://maps.googleapis.com/maps/api/staticmap?key=hidden", source: "paid" },
  ],
);

console.info("listing image optimization smoke checks passed");