import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLessonGuidePath,
  lessonGuides,
  LESSON_GUIDE_BASE_PATH,
} from "../../../lib/lesson-guides/src/index.ts";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(origin) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error("Production server did not become ready");
}

const port = await reservePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["serve.mjs"], {
  cwd: artifactDir,
  env: {
    ...process.env,
    PORT: String(port),
    BASE_PATH: "/",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(origin);

  const sitemapResponse = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();
  const expectedGuidePaths = [
    LESSON_GUIDE_BASE_PATH,
    ...lessonGuides.map((guide) => getLessonGuidePath(guide.slug)),
  ];
  for (const guidePath of expectedGuidePaths) {
    assert.match(
      sitemap,
      new RegExp(`<loc>https://www\\.saddleupguide\\.com${guidePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`),
    );
  }

  const separatorResponse = await fetch(`${origin}/browse?&&`);
  assert.equal(separatorResponse.status, 200);
  assert.equal(separatorResponse.headers.get("x-robots-tag"), "noindex, follow");
  const separatorHtml = await separatorResponse.text();
  assert.match(separatorHtml, /name="robots" content="noindex,follow"/);
  assert.match(separatorHtml, /rel="canonical" href="https:\/\/www\.saddleupguide\.com\/browse"/);

  const cleanResponse = await fetch(`${origin}/browse`);
  assert.equal(cleanResponse.status, 200);
  assert.equal(cleanResponse.headers.get("x-robots-tag"), null);
  assert.match(await cleanResponse.text(), /name="robots" content="index,follow"/);
} catch (error) {
  if (serverOutput) console.error(serverOutput);
  throw error;
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}

console.info("production sitemap and indexation smoke checks passed");