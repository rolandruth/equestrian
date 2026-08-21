import { resolveState } from "../lib/localSeo.js";

function assertState(
  input: string,
  expected: { name: string; slug: string } | null,
): void {
  const actual = resolveState(input);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(input)} to resolve to ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

assertState("IL", { name: "Illinois", slug: "illinois" });
assertState("il", { name: "Illinois", slug: "illinois" });
assertState(" Illinois ", { name: "Illinois", slug: "illinois" });
assertState("CT", { name: "Connecticut", slug: "connecticut" });
assertState("District of Columbia", {
  name: "District of Columbia",
  slug: "district-of-columbia",
});
assertState("Not A State", null);

console.log("Local SEO state normalization smoke test: passed");