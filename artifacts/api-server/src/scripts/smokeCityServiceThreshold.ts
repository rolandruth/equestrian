/**
 * Regression: city-service threshold parity.
 *
 * Verifies that a city with exactly 5 confirmed-service published entries is
 * eligible for a city-service landing page even though its parent state has
 * only 5 entries (< 8 state-service threshold) and globally only 5 entries
 * (< 10 global-service threshold).
 *
 * Isolation strategy
 * ──────────────────
 * To make cross-process layers (API server, SSR server) see the test fixture,
 * rows must be committed to the shared dev database before child processes are
 * spawned — a rollback-based transaction would hide them from separate processes.
 * Isolation is achieved instead through unique-per-run slugs: every run derives
 * stateSlug, citySlug, and serviceSlug from a millisecond timestamp so no two
 * runs (and no pre-existing production data) can share the same combination.
 * The finally block deletes every row keyed on those unique slugs and asserts
 * zero residual rows remain.
 *
 * Coverage layers
 * ───────────────
 *   1. Direct  – getLandingEntries() called in-process; all three eligibility
 *                outcomes asserted unconditionally.
 *   2. API     – GET /api/public/local-seo/landing against dist/index.mjs on
 *                an ephemeral OS-assigned port.
 *   3. SSR     – GET /services/:svc/:state/:city against serve.mjs on a second
 *                ephemeral port; state+global pages assert HTTP 404.
 *   4. Sitemap – /sitemap.xml contains the city-service <loc>; state-service
 *                <loc> is absent as a standalone entry.
 *
 * No packages added beyond Node built-ins (net, http, child_process).
 * seedServiceTypes() is NOT called; the test inserts its own temporary
 * service_type row and removes it in finally.
 *
 * Run:
 *   cd artifacts/api-server
 *   ./node_modules/.bin/tsx src/scripts/smokeCityServiceThreshold.ts
 */

import { db, entries, serviceTypes, entryServiceTypes, entryLocations } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { getLandingEntries } from "../lib/localSeo.js";
import { spawn } from "node:child_process";
import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../");
const API_DIST = path.join(ROOT, "artifacts/api-server/dist/index.mjs");
const SERVE_MJS = path.join(ROOT, "artifacts/directory-master/serve.mjs");

// ── Unique per-run identifiers ────────────────────────────────────────────────
// Millisecond suffix makes these unique across concurrent runs and guarantees
// they will never collide with any real production data.
const RUN_ID = Date.now();
const SVC_SLUG = `smoke-svc-${RUN_ID}`;          // e.g. smoke-svc-1718000000000
const SVC_LABEL = `Smoke Service ${RUN_ID}`;
const STATE_SLUG = `smoke-state-${RUN_ID}`;       // e.g. smoke-state-1718000000000
const STATE_NAME = `SmokeState${RUN_ID}`;
const CITY_SLUG = `smoke-city-${RUN_ID}`;
const CITY_NAME = `SmokeCity${RUN_ID}`;
const N = 5; // exactly at city threshold (5); below state (8) and global (10)

// ── Tracked IDs for cleanup ───────────────────────────────────────────────────
let insertedEntryIds: number[] = [];
let insertedServiceTypeId: number | null = null;

// ── Assertion helper ──────────────────────────────────────────────────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

// ── Find a free OS port via port-0 bind (built-in net module) ────────────────
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

// ── HTTP GET helper ───────────────────────────────────────────────────────────
function httpGet(url: string, timeoutMs = 10000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout (${timeoutMs}ms): GET ${url}`)),
      timeoutMs,
    );
    http
      .get(url, (res) => {
        clearTimeout(timer);
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
        res.on("error", reject);
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ── Wait for a port to accept connections ────────────────────────────────────
async function waitForPort(port: number, tries = 40, delayMs = 400): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await httpGet(`http://127.0.0.1:${port}/`, 1000);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Port ${port} did not become ready after ${tries * delayMs}ms`);
}

// ── Seed fixture rows (committed immediately so child processes see them) ─────
async function seedData(): Promise<void> {
  // Insert a temporary service_types row with a unique slug.
  // onConflictDoNothing is a safety net; the slug is unique per run so conflict
  // should never occur.
  const [st] = await db
    .insert(serviceTypes)
    .values({ slug: SVC_SLUG, label: SVC_LABEL, description: "Smoke-test only — safe to delete" })
    .onConflictDoNothing()
    .returning({ id: serviceTypes.id });
  if (!st) throw new Error(`Could not insert temporary service type '${SVC_SLUG}'`);
  insertedServiceTypeId = st.id;
  console.log(`  Inserted temp service_type id=${st.id} slug=${SVC_SLUG}`);

  // Insert N published entries with unique slugs.
  const entryValues = Array.from({ length: N }, (_, i) => ({
    title: `[SMOKE:CST ${RUN_ID}] Entry ${i + 1}`,
    slug: `${SVC_SLUG}-entry-${i + 1}`,
    published: true,
  }));
  const inserted = await db
    .insert(entries)
    .values(entryValues)
    .returning({ id: entries.id });
  insertedEntryIds = inserted.map((r: { id: number }) => r.id);
  console.log(`  Inserted ${N} published entries: ${insertedEntryIds.join(", ")}`);

  // Confirmed location: unique state + city slugs (no real US state needed).
  await db.insert(entryLocations).values(
    insertedEntryIds.map((entryId) => ({
      entryId,
      cityName: CITY_NAME,
      citySlug: CITY_SLUG,
      stateName: STATE_NAME,
      stateSlug: STATE_SLUG,
      locationStatus: "confirmed",
      locationSource: "smoke-test",
      locationConfidence: 1.0,
    })),
  );

  // Confirmed service assignment to our temp service type.
  await db.insert(entryServiceTypes).values(
    insertedEntryIds.map((entryId) => ({
      entryId,
      serviceTypeId: insertedServiceTypeId!,
      status: "confirmed",
      source: "smoke-test",
      confidence: 1.0,
    })),
  );

  console.log(
    `  Confirmed locations (${STATE_NAME}/${CITY_NAME}) and service (${SVC_SLUG}) for all ${N} entries.`,
  );
}

// ── Cleanup: delete temp rows; verify no residual ─────────────────────────────
async function cleanup(): Promise<void> {
  // entry_locations and entry_service_types are cascade-deleted with their entry.
  if (insertedEntryIds.length > 0) {
    await db.delete(entries).where(inArray(entries.id, insertedEntryIds));
    console.log(`  Deleted ${insertedEntryIds.length} temp entries (cascades location + service rows).`);
  }
  if (insertedServiceTypeId !== null) {
    await db.delete(serviceTypes).where(eq(serviceTypes.id, insertedServiceTypeId));
    console.log(`  Deleted temp service_type id=${insertedServiceTypeId}.`);
  }

  // Verify no residual rows remain under our unique identifiers.
  const residualEntries = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.slug, `${SVC_SLUG}-entry-1`));
  assert(residualEntries.length === 0, `no residual entry rows (slug prefix ${SVC_SLUG})`);

  const residualSvc = await db
    .select({ id: serviceTypes.id })
    .from(serviceTypes)
    .where(eq(serviceTypes.slug, SVC_SLUG));
  assert(residualSvc.length === 0, `no residual service_type row (slug ${SVC_SLUG})`);

  console.log("  Cleanup verified: zero residual rows.");
}

// ── Layer 1: direct in-process call ──────────────────────────────────────────
async function layer1_direct(): Promise<void> {
  console.log("\n── Layer 1: Direct getLandingEntries() ──");

  // City-service: exactly 5 entries ≥ CITY_SERVICE_THRESHOLD (5) → eligible.
  const cityResult = await getLandingEntries({
    stateSlug: STATE_SLUG,
    citySlug: CITY_SLUG,
    serviceSlug: SVC_SLUG,
  });
  assert(cityResult.eligible === true, `city-service eligible (${N} entries ≥ city threshold 5)`);
  assert(
    typeof cityResult.total === "number" && cityResult.total === N,
    `city-service total=${N} (exactly our seeded entries)`,
  );

  // State-service: same 5 entries in the state < STATE_SERVICE_THRESHOLD (8) → ineligible.
  const stateResult = await getLandingEntries({
    stateSlug: STATE_SLUG,
    serviceSlug: SVC_SLUG,
  });
  assert(
    stateResult.eligible === false,
    `state-service ineligible (${N} entries < state threshold 8)`,
  );

  // Global-service: exactly 5 entries for the temp slug globally < GLOBAL_SERVICE_THRESHOLD (10)
  // → ineligible. Because SVC_SLUG is unique-per-run there can be no other confirmed entries
  // for this service type in any environment.
  const globalResult = await getLandingEntries({ serviceSlug: SVC_SLUG });
  assert(
    globalResult.eligible === false,
    `global-service ineligible (${N} entries < global threshold 10)`,
  );
}

// ── Layer 2: API HTTP ─────────────────────────────────────────────────────────
async function layer2_api_http(apiPort: number): Promise<void> {
  console.log("\n── Layer 2: API HTTP /api/public/local-seo/landing ──");
  const base = `http://127.0.0.1:${apiPort}`;

  const cityR = await httpGet(
    `${base}/api/public/local-seo/landing?stateSlug=${STATE_SLUG}&citySlug=${CITY_SLUG}&serviceSlug=${SVC_SLUG}`,
  );
  assert(cityR.status === 200, `city-service API → HTTP 200`);
  const cityBody = JSON.parse(cityR.body);
  assert(cityBody.eligible === true, `city-service API body.eligible=true`);
  assert(
    typeof cityBody.total === "number" && cityBody.total === N,
    `city-service API body.total=${N}`,
  );

  const stateR = await httpGet(
    `${base}/api/public/local-seo/landing?stateSlug=${STATE_SLUG}&serviceSlug=${SVC_SLUG}`,
  );
  assert(stateR.status === 200, `state-service API → HTTP 200`);
  const stateBody = JSON.parse(stateR.body);
  assert(stateBody.eligible === false, `state-service API body.eligible=false`);

  const globalR = await httpGet(
    `${base}/api/public/local-seo/landing?serviceSlug=${SVC_SLUG}`,
  );
  assert(globalR.status === 200, `global-service API → HTTP 200`);
  const globalBody = JSON.parse(globalR.body);
  assert(globalBody.eligible === false, `global-service API body.eligible=false`);
}

// ── Layer 3: SSR HTTP (serve.mjs) ────────────────────────────────────────────
async function layer3_ssr_http(servePort: number): Promise<void> {
  console.log("\n── Layer 3: SSR HTTP serve.mjs ──");
  const base = `http://127.0.0.1:${servePort}`;

  // City-service page must render (200) — 5 ≥ cityService threshold of 5.
  const cityR = await httpGet(
    `${base}/services/${SVC_SLUG}/${STATE_SLUG}/${CITY_SLUG}`,
    15000,
  );
  assert(cityR.status === 200, `SSR city-service page → HTTP 200`);
  assert(
    cityR.body.includes(CITY_NAME) || cityR.body.includes(CITY_SLUG),
    `SSR city-service page body references city name/slug`,
  );

  // State-service page must 404 — 5 < stateService threshold of 8.
  const stateR = await httpGet(`${base}/services/${SVC_SLUG}/${STATE_SLUG}`, 15000);
  assert(
    stateR.status === 404,
    `SSR state-service page → HTTP 404 (${N} entries < state threshold 8)`,
  );

  // Global-service page must 404 — 5 < serviceGlobal threshold of 10.
  // Because SVC_SLUG is unique-per-run, only our 5 seeded entries exist for it.
  const globalR = await httpGet(`${base}/services/${SVC_SLUG}`, 15000);
  assert(
    globalR.status === 404,
    `SSR global-service page → HTTP 404 (${N} entries < global threshold 10)`,
  );
}

// ── Layer 4: Sitemap ──────────────────────────────────────────────────────────
async function layer4_sitemap(servePort: number): Promise<void> {
  console.log("\n── Layer 4: Sitemap ──");
  const base = `http://127.0.0.1:${servePort}`;

  const smR = await httpGet(`${base}/sitemap.xml`, 20000);
  assert(smR.status === 200, `sitemap.xml → HTTP 200`);

  // The city-service combination must appear.
  const expectedCityServiceUrl = `/services/${SVC_SLUG}/${STATE_SLUG}/${CITY_SLUG}`;
  assert(
    smR.body.includes(expectedCityServiceUrl),
    `sitemap contains city-service <loc>: ${expectedCityServiceUrl}`,
  );

  // The state-service combination must NOT appear as a standalone <loc>.
  // (The city-service URL happens to be a string-prefix of itself with a city
  // suffix, so we check for the exact </loc>-terminated form.)
  const stateServiceLoc = `/services/${SVC_SLUG}/${STATE_SLUG}</loc>`;
  assert(
    !smR.body.includes(stateServiceLoc),
    `sitemap does NOT contain standalone state-service <loc>: /services/${SVC_SLUG}/${STATE_SLUG}`,
  );

  // The global-service page must not appear either.
  const globalServiceLoc = `/services/${SVC_SLUG}</loc>`;
  assert(
    !smR.body.includes(globalServiceLoc),
    `sitemap does NOT contain global-service <loc>: /services/${SVC_SLUG}`,
  );
}

// ── Spawn both servers on free ephemeral ports; run layers 2–4; kill on exit ─
async function runWithServers(): Promise<void> {
  const [apiPort, servePort] = await Promise.all([getFreePort(), getFreePort()]);

  const apiEnv = { ...process.env, PORT: String(apiPort) };
  const serveEnv = {
    ...process.env,
    PORT: String(servePort),
    PUBLIC_SITE_URL: `http://127.0.0.1:${servePort}`,
  };

  console.log(`\nStarting api-server on ephemeral port ${apiPort}...`);
  const apiProc = spawn("node", [API_DIST], { env: apiEnv, stdio: "pipe" });
  apiProc.stderr?.on("data", (_d: Buffer) => { /* suppress */ });
  apiProc.stdout?.on("data", (_d: Buffer) => { /* suppress */ });

  console.log(`Starting serve.mjs on ephemeral port ${servePort}...`);
  const serveProc = spawn("node", [SERVE_MJS], { env: serveEnv, stdio: "pipe" });
  serveProc.stderr?.on("data", (_d: Buffer) => { /* suppress */ });
  serveProc.stdout?.on("data", (_d: Buffer) => { /* suppress */ });

  try {
    await waitForPort(apiPort);
    console.log(`  api-server ready on ${apiPort}`);
    await waitForPort(servePort);
    console.log(`  serve.mjs ready on ${servePort}`);

    await layer2_api_http(apiPort);
    await layer3_ssr_http(servePort);
    await layer4_sitemap(servePort);
  } finally {
    apiProc.kill("SIGTERM");
    serveProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("=== City-Service Threshold Parity Regression ===");
  console.log(`    Run ID : ${RUN_ID}`);
  console.log(`    Service: ${SVC_SLUG}`);
  console.log(`    State  : ${STATE_SLUG}`);
  console.log(`    City   : ${CITY_SLUG}\n`);

  await seedData();

  let testError: Error | null = null;
  try {
    await layer1_direct();
    await runWithServers();
  } catch (err) {
    testError = err as Error;
  } finally {
    console.log("\nCleaning up committed fixture rows...");
    try {
      await cleanup();
    } catch (cleanErr) {
      console.error("  CLEANUP ERROR:", cleanErr);
      // Don't mask the original test error
    }
  }

  if (testError) {
    console.error("\n❌ REGRESSION FAILED:");
    console.error(testError.message);
    process.exit(1);
  }

  console.log("\n✅ ALL REGRESSION LAYERS PASSED.");
  console.log(
    `   City-service (${N} entries) eligible; state-service and global-service ineligible as expected.`,
  );
}

main().catch((err) => {
  console.error("\n❌ UNEXPECTED STARTUP ERROR:", err);
  // Best-effort cleanup before exit
  cleanup()
    .catch(() => {})
    .finally(() => process.exit(1));
});
