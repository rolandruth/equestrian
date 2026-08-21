export const ENTRY_SLUG_ADVISORY_LOCK_ID = 73492751;

export function isEntrySlugUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  };
  const code = candidate.code ?? candidate.cause?.code;
  const constraint = candidate.constraint ?? candidate.cause?.constraint;

  return code === "23505" && (
    constraint === undefined ||
    constraint === "entries_slug_unique"
  );
}