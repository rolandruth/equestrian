import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";

const DUPLICATE_LOCATION_REPAIR_LOCK_ID = 73492752;

const STATE_ABBREVIATIONS = [
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
  ["District of Columbia", "DC"],
] as const;

type SqlExecutor = {
  execute(query: SQL): Promise<unknown>;
};

type RepairRow = {
  id: number;
  title: string;
  before: string;
  after: string;
  repair_kind: "full_state" | "abbreviated" | "abbreviation_only";
};

type PreviewRow = {
  total_matches: number | string;
  full_state_matches: number | string;
  abbreviated_matches: number | string;
  abbreviation_only_matches: number | string;
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
  abbreviationOnlyMatches: number;
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

function stateAbbreviationsSql() {
  const rows = STATE_ABBREVIATIONS.map(([stateName, abbreviation]) =>
    sql`(${stateName}, ${abbreviation})`
  );
  return sql`state_abbreviations(state_name, abbreviation) AS (VALUES ${sql.join(rows, sql`, `)})`;
}

function duplicateLocationCandidatesSql() {
  return sql`
    WITH ${stateAbbreviationsSql()},
    full_state_candidates AS (
      SELECT
        e.id,
        e.title,
        e.location AS before,
        regexp_replace(
          e.location,
          '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?), \\2, ' || state.state_name || ' \\3$',
          '\\1, \\2, ' || state.state_name || ' \\3',
          'i'
        ) AS after,
        'full_state'::text AS repair_kind
      FROM entries e
      INNER JOIN state_abbreviations state ON e.location ~* (
        '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?), \\2, ' || state.state_name || ' \\3$'
      )
    ),
    abbreviated_candidates AS (
      SELECT
        e.id,
        e.title,
        e.location AS before,
        regexp_replace(
          e.location,
          '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?), \\2, ' || state.abbreviation || ' \\3$',
          '\\1, \\2, ' || state.state_name || ' \\3',
          'i'
        ) AS after,
        'abbreviated'::text AS repair_kind
      FROM entries e
      INNER JOIN state_abbreviations state ON e.location ~* (
        '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?), \\2, ' || state.abbreviation || ' \\3$'
      )
    ),
    abbreviation_only_candidates AS (
      SELECT
        e.id,
        e.title,
        e.location AS before,
        regexp_replace(
          e.location,
          '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?)$',
          '\\1, \\2, ' || state.state_name || ' \\3',
          'i'
        ) AS after,
        'abbreviation_only'::text AS repair_kind
      FROM entries e
      INNER JOIN state_abbreviations state ON e.location ~* (
        '^(.*), ([^,]+), ' || state.abbreviation || ' ([0-9]{5}(?:-[0-9]{4})?)$'
      )
      WHERE NOT EXISTS (
        SELECT 1 FROM full_state_candidates candidate WHERE candidate.id = e.id
      )
        AND NOT EXISTS (
          SELECT 1 FROM abbreviated_candidates candidate WHERE candidate.id = e.id
        )
    ),
    candidates AS (
      SELECT * FROM full_state_candidates
      UNION ALL
      SELECT * FROM abbreviated_candidates
      UNION ALL
      SELECT * FROM abbreviation_only_candidates
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
      count(*) FILTER (WHERE repair_kind = 'abbreviation_only')::int AS abbreviation_only_matches,
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
    abbreviationOnlyMatches: Number(row.abbreviation_only_matches),
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