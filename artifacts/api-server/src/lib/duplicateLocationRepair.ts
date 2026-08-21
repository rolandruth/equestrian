import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";

const DUPLICATE_LOCATION_REPAIR_LOCK_ID = 73492752;

type SqlExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type RepairRow = {
  id: number;
  title: string;
  before: string;
  after: string;
  repair_kind: "full_state" | "abbreviated";
};

type PreviewRow = {
  total_matches: number | string;
  full_state_matches: number | string;
  abbreviated_matches: number | string;
  sample: Array<{
    id: number;
    title: string;
    before: string;
    after: string;
  }> | string | null;
};

export type DuplicateLocationRepairPreview = {
  totalMatches: number;
  fullStateMatches: number;
  abbreviatedMatches: number;
  sample: Array<{
    id: number;
    title: string;
    before: string;
    after: string;
  }>;
};

export class DuplicateLocationRepairConflictError extends Error {
  constructor(public readonly currentCount: number) {
    super("The duplicate-location candidate count changed. Preview again before repairing.");
    this.name = "DuplicateLocationRepairConflictError";
  }
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function parseSample(value: PreviewRow["sample"]): DuplicateLocationRepairPreview["sample"] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed as DuplicateLocationRepairPreview["sample"]
      : [];
  }
  return [];
}

function duplicateLocationCandidatesSql() {
  return sql`
    WITH full_state_suffixes AS (
      SELECT
        e.id,
        e.title,
        e.location AS before,
        left(
          e.location,
          length(e.location) - length(', ' || el.city_name || ', ' || el.state_name || ' ' || el.postal_code)
        ) AS after,
        el.city_name,
        el.postal_code
      FROM entries e
      INNER JOIN entry_locations el ON el.entry_id = e.id
      WHERE e.location IS NOT NULL
        AND btrim(e.location) <> ''
        AND el.city_name IS NOT NULL
        AND btrim(el.city_name) <> ''
        AND el.state_name IS NOT NULL
        AND btrim(el.state_name) <> ''
        AND el.postal_code IS NOT NULL
        AND btrim(el.postal_code) <> ''
        AND lower(right(e.location, length(', ' || el.city_name || ', ' || el.state_name || ' ' || el.postal_code))) =
            lower(', ' || el.city_name || ', ' || el.state_name || ' ' || el.postal_code)
    ),
    full_state_candidates AS (
      SELECT
        suffix.id,
        suffix.title,
        suffix.before,
        suffix.after,
        'full_state'::text AS repair_kind
      FROM full_state_suffixes suffix
      CROSS JOIN LATERAL (
        SELECT regexp_match(
          suffix.after,
          ', ([^,]+), ([^,]+) ([0-9]{5}(?:-[0-9]{4})?)$'
        ) AS parts
      ) parsed
      WHERE parsed.parts IS NOT NULL
        AND lower(btrim((parsed.parts)[1])) = lower(btrim(suffix.city_name))
        AND btrim((parsed.parts)[2]) <> ''
        AND btrim((parsed.parts)[3]) = btrim(suffix.postal_code)
    ),
    abbreviated_candidates AS (
      SELECT
        e.id,
        e.title,
        e.location AS before,
        regexp_replace(
          e.location,
          '(, [^,]+, [A-Z]{2} [0-9]{5}(?:-[0-9]{4})?)\\1$',
          '\\1'
        ) AS after,
        'abbreviated'::text AS repair_kind
      FROM entries e
      WHERE e.location ~ '(, [^,]+, [A-Z]{2} [0-9]{5}(?:-[0-9]{4})?)\\1$'
    ),
    candidates AS (
      SELECT * FROM full_state_candidates
      UNION ALL
      SELECT * FROM abbreviated_candidates
    )
  `;
}

async function queryPreview(executor: SqlExecutor): Promise<DuplicateLocationRepairPreview> {
  const result = await executor.execute(sql`
    ${duplicateLocationCandidatesSql()}
    SELECT
      count(*)::int AS total_matches,
      count(*) FILTER (WHERE repair_kind = 'full_state')::int AS full_state_matches,
      count(*) FILTER (WHERE repair_kind = 'abbreviated')::int AS abbreviated_matches,
      COALESCE(
        (
          SELECT json_agg(sample_row ORDER BY sample_row.id)
          FROM (
            SELECT id, title, before, after
            FROM candidates
            ORDER BY id
            LIMIT 10
          ) sample_row
        ),
        '[]'::json
      ) AS sample
    FROM candidates
  `);
  const row = resultRows<PreviewRow>(result)[0];
  if (!row) throw new Error("Duplicate-location preview returned no result");

  return {
    totalMatches: Number(row.total_matches),
    fullStateMatches: Number(row.full_state_matches),
    abbreviatedMatches: Number(row.abbreviated_matches),
    sample: parseSample(row.sample),
  };
}

export async function previewDuplicateLocationRepair(): Promise<DuplicateLocationRepairPreview> {
  return queryPreview(db as unknown as SqlExecutor);
}

export async function repairDuplicateLocations(expectedCount: number): Promise<{
  repairedCount: number;
  remainingMatches: number;
}> {
  return db.transaction(async (tx) => {
    const executor = tx as unknown as SqlExecutor;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${DUPLICATE_LOCATION_REPAIR_LOCK_ID})`);

    const before = await queryPreview(executor);
    if (before.totalMatches !== expectedCount || expectedCount < 1) {
      throw new DuplicateLocationRepairConflictError(before.totalMatches);
    }

    const result = await tx.execute(sql`
      ${duplicateLocationCandidatesSql()},
      updated AS (
        UPDATE entries e
        SET location = candidates.after
        FROM candidates
        WHERE e.id = candidates.id
          AND e.location = candidates.before
        RETURNING e.id
      )
      SELECT count(*)::int AS repaired_count
      FROM updated
    `);
    const repairedCount = Number(
      resultRows<{ repaired_count: number | string }>(result)[0]?.repaired_count ?? 0,
    );
    if (repairedCount !== expectedCount) {
      throw new Error(
        `Duplicate-location repair expected ${expectedCount} updates but changed ${repairedCount}`,
      );
    }

    const after = await queryPreview(executor);
    if (after.totalMatches !== 0) {
      throw new Error(
        `Duplicate-location repair left ${after.totalMatches} matching rows; transaction rolled back`,
      );
    }

    return {
      repairedCount,
      remainingMatches: after.totalMatches,
    };
  });
}