/**
 * Focused smoke test for the non-destructive service review fix.
 *
 * Verifies that when a reviewer approves/rejects a manual_review service
 * suggestion on an entry, a SEPARATE pre-confirmed service row on the SAME
 * entry survives untouched (never deleted, never re-statused).
 *
 * All work happens inside a transaction that is ALWAYS rolled back, so no
 * production-like data is mutated. A temporary dev entry + service rows are
 * created and torn down inside the rollback.
 *
 * Run:  pnpm --filter @workspace/api-server exec tsx src/scripts/smokeReviewServiceSuggestions.ts
 */
import { db, entries, serviceTypes, entryServiceTypes } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { seedServiceTypes, reviewServiceSuggestions } from "../lib/localSeo.js";

const ROLLBACK = Symbol("intentional-rollback");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  await seedServiceTypes();

  // Resolve two distinct service type ids to use.
  const sts = await db
    .select({ id: serviceTypes.id, slug: serviceTypes.slug })
    .from(serviceTypes)
    .limit(3);
  if (sts.length < 3) {
    throw new Error("Need at least 3 seeded service types to run this test.");
  }
  const preConfirmed = sts[0]; // pre-existing confirmed row (must survive)
  const approvedSuggestion = sts[1]; // manual_review → confirmed
  const rejectedSuggestion = sts[2]; // manual_review → rejected

  console.log("Service types under test:");
  console.log(`  preConfirmed      = ${preConfirmed.slug}`);
  console.log(`  approvedSuggestion= ${approvedSuggestion.slug}`);
  console.log(`  rejectedSuggestion= ${rejectedSuggestion.slug}`);

  let sawExpectedRollback = false;

  try {
    await db.transaction(async (tx: any) => {
      // ── Setup: create a temporary dev entry ──
      const [entry] = await tx
        .insert(entries)
        .values({
          title: "[SMOKE TEST] temp entry — safe to ignore",
          slug: `smoke-test-${Date.now()}`,
          published: false,
        })
        .returning({ id: entries.id });
      const entryId = entry.id;
      console.log(`\nCreated temp entry id=${entryId} (published=false)`);

      // Pre-existing CONFIRMED service assignment (with audit fields)
      const preConfirmedReviewedAt = new Date("2020-01-01T00:00:00.000Z");
      await tx.insert(entryServiceTypes).values({
        entryId,
        serviceTypeId: preConfirmed.id,
        status: "confirmed",
        source: "import",
        confidence: 1.0,
        reviewedAt: preConfirmedReviewedAt,
        reviewedBy: "original-importer",
      });

      // Two manual_review suggestions
      await tx.insert(entryServiceTypes).values([
        {
          entryId,
          serviceTypeId: approvedSuggestion.id,
          status: "manual_review",
          source: "deterministic",
          confidence: 0.7,
        },
        {
          entryId,
          serviceTypeId: rejectedSuggestion.id,
          status: "manual_review",
          source: "deterministic",
          confidence: 0.7,
        },
      ]);

      console.log("Seeded 1 confirmed row + 2 manual_review suggestions.\n");

      // ── Act: reviewer approves ONLY approvedSuggestion ──
      const result = await reviewServiceSuggestions(
        entryId,
        [approvedSuggestion.slug],
        "test-reviewer",
        tx,
      );
      console.log(
        `reviewServiceSuggestions => confirmed=${result.confirmed}, rejected=${result.rejected}\n`,
      );

      // ── Assert ──
      const rows = await tx
        .select({
          serviceTypeId: entryServiceTypes.serviceTypeId,
          status: entryServiceTypes.status,
          source: entryServiceTypes.source,
          reviewedBy: entryServiceTypes.reviewedBy,
          reviewedAt: entryServiceTypes.reviewedAt,
        })
        .from(entryServiceTypes)
        .where(eq(entryServiceTypes.entryId, entryId));

      type SvcRow = {
        serviceTypeId: number;
        status: string;
        source: string | null;
        reviewedBy: string | null;
        reviewedAt: Date | null;
      };
      const byId = new Map<number, SvcRow>(
        (rows as SvcRow[]).map((r) => [r.serviceTypeId, r]),
      );

      // The whole point: the pre-confirmed row still exists and is unchanged.
      assert(byId.size === 3, "all 3 service rows still exist (nothing deleted)");

      const pc = byId.get(preConfirmed.id);
      assert(!!pc, "pre-confirmed row survived (not deleted)");
      assert(pc!.status === "confirmed", "pre-confirmed row is still 'confirmed'");
      assert(pc!.source === "import", "pre-confirmed row source unchanged ('import')");
      assert(
        pc!.reviewedBy === "original-importer",
        "pre-confirmed row audit reviewedBy unchanged",
      );
      assert(
        pc!.reviewedAt?.getTime() === preConfirmedReviewedAt.getTime(),
        "pre-confirmed row audit reviewedAt unchanged",
      );

      const app = byId.get(approvedSuggestion.id);
      assert(app!.status === "confirmed", "approved suggestion → 'confirmed'");
      assert(app!.reviewedBy === "test-reviewer", "approved suggestion reviewedBy set");

      const rej = byId.get(rejectedSuggestion.id);
      assert(rej!.status === "rejected", "unselected suggestion → 'rejected' (audit retained)");
      assert(rej!.reviewedBy === "test-reviewer", "rejected suggestion reviewedBy set");

      assert(result.confirmed === 1, "exactly 1 suggestion confirmed");
      assert(result.rejected === 1, "exactly 1 suggestion rejected");

      // Force rollback so nothing persists.
      throw ROLLBACK;
    });
  } catch (err) {
    if (err === ROLLBACK) {
      sawExpectedRollback = true;
    } else {
      throw err;
    }
  }

  assert(sawExpectedRollback, "transaction was rolled back (no data persisted)");

  console.log("\n✅ SMOKE TEST PASSED: confirmed rows survive suggestion review.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ SMOKE TEST FAILED");
    console.error(err);
    process.exit(1);
  });
