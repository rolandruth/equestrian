/**
 * Deterministic smoke test for importHelpers (no DB, no network).
 * Run with:  pnpm --filter @workspace/api-server smoke:import-helpers
 */

import { composeLocation, slugifyTitle, allocateSlugs } from "../lib/importHelpers.js";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── composeLocation ──────────────────────────────────────────────────────────

console.log("\n── composeLocation ──────────────────────────────────────────");

// 1. Full address with state abbreviation → canonical full state name
assert(
  "Alaska full address, abbrev state, matching city/state/ZIP → full state name",
  composeLocation("11120 Birch Rd, Anchorage, AK 99516", {
    city: "Anchorage",
    state: "Alaska",
    zip: "99516",
  }),
  "11120 Birch Rd, Anchorage, Alaska 99516",
);

// 2. Street only → appends city + full state name + ZIP
assert(
  "Street-only → append city, state, ZIP",
  composeLocation("11120 Birch Rd", {
    city: "Anchorage",
    state: "Alaska",
    zip: "99516",
  }),
  "11120 Birch Rd, Anchorage, Alaska 99516",
);

// 3. Full state name already present → unchanged
assert(
  "Full state name already present → unchanged",
  composeLocation("11120 Birch Rd, Anchorage, Alaska 99516", {
    city: "Anchorage",
    state: "AK",
    zip: "99516",
  }),
  "11120 Birch Rd, Anchorage, Alaska 99516",
);

// 4. ZIP+4 in existing, 5-digit zip part → preserve ZIP+4 and expand state
assert(
  "ZIP+4 in existing, plain ZIP in parts → unchanged",
  composeLocation("123 Main St, Springfield, IL 62701-1234", {
    city: "Springfield",
    state: "IL",
    zip: "62701",
  }),
  "123 Main St, Springfield, Illinois 62701-1234",
);

// 5. Partial location (city missing) → appends city
assert(
  "Partial location missing city → city appended",
  composeLocation("AK 99516", {
    city: "Anchorage",
    state: "Alaska",
    zip: "99516",
  }),
  "Alaska 99516, Anchorage",
);

// 6. No existing location → built from parts
assert(
  "No existing location → built from city + state + ZIP",
  composeLocation(null, {
    city: "Denver",
    state: "CO",
    zip: "80203",
  }),
  "Denver, Colorado 80203",
);

// 7. Existing location is empty string → built from parts
assert(
  "Empty existing → built from parts",
  composeLocation("", {
    city: "Austin",
    state: "Texas",
    zip: "78701",
  }),
  "Austin, Texas 78701",
);

// 8. Country appended when missing
assert(
  "Country missing from existing → appended",
  composeLocation("Chicago, Illinois 60601", {
    city: "Chicago",
    state: "IL",
    zip: "60601",
    country: "USA",
  }),
  "Chicago, Illinois 60601, USA",
);

// 9. All parts already present (no country) → unchanged
assert(
  "All parts present, no country → unchanged",
  composeLocation("Chicago, Illinois 60601, USA", {
    city: "Chicago",
    state: "IL",
    zip: "60601",
    country: "USA",
  }),
  "Chicago, Illinois 60601, USA",
);

// 10. Case differences (city in different case), state still canonicalized
assert(
  "City present in different case → unchanged",
  composeLocation("11120 Birch Rd, ANCHORAGE, AK 99516", {
    city: "Anchorage",
    state: "AK",
    zip: "99516",
  }),
  "11120 Birch Rd, ANCHORAGE, Alaska 99516",
);

// 11. A business/street name beginning with "AR" is not an Arkansas state token
assert(
  "AR in a name does not suppress the missing Arkansas state",
  composeLocation("AR Barn, 123 Main St", {
    city: "Little Rock",
    state: "Arkansas",
    zip: "72201",
  }),
  "AR Barn, 123 Main St, Little Rock, Arkansas 72201",
);

// ─── slugifyTitle ─────────────────────────────────────────────────────────────

console.log("\n── slugifyTitle ─────────────────────────────────────────────");

assert("normal title", slugifyTitle("Anchorage Riding School"), "anchorage-riding-school");
assert("title with punctuation", slugifyTitle("Bob's Trail Co."), "bob-s-trail-co");
assert("empty title → listing", slugifyTitle(""), "listing");
assert("non-ASCII only → listing", slugifyTitle("日本語タイトル"), "listing");
assert("mixed ASCII + diacritics", slugifyTitle("Café Équitation"), "cafe-equitation");

// ─── allocateSlugs ────────────────────────────────────────────────────────────

console.log("\n── allocateSlugs ────────────────────────────────────────────");

// Duplicate titles in the same batch
const used1 = new Set<string>();
const result1 = allocateSlugs(
  ["Anchorage Riding School", "Anchorage Riding School", "Anchorage Riding School"],
  used1,
);
assert(
  "Duplicate titles produce distinct slugs",
  result1,
  ["anchorage-riding-school", "anchorage-riding-school-2", "anchorage-riding-school-3"],
);

// Conflict with existing DB slug
const used2 = new Set<string>(["trail-riders"]);
const result2 = allocateSlugs(["Trail Riders", "Summit Ranch"], used2);
assert(
  "Conflict with existing slug → -2 suffix",
  result2,
  ["trail-riders-2", "summit-ranch"],
);

// Empty title fallback
const used3 = new Set<string>();
const result3 = allocateSlugs(["", ""], used3);
assert(
  "Empty titles get 'listing' fallback with counter",
  result3,
  ["listing", "listing-2"],
);

// Non-ASCII title fallback, conflict with existing
const used4 = new Set<string>(["listing"]);
const result4 = allocateSlugs(["日本語"], used4);
assert(
  "Non-ASCII title fallback conflicts with existing → -2",
  result4,
  ["listing-2"],
);

// Already-full Alaska address (duplicate scenario from req #1)
// Titles are distinct so slugs should differ only if they produce the same base
const used5 = new Set<string>();
const result5 = allocateSlugs(
  ["Birch Road Stables", "Birch Road Stables"],
  used5,
);
assert(
  "Same batch duplicated Alaska listing gets distinct slugs",
  result5,
  ["birch-road-stables", "birch-road-stables-2"],
);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
