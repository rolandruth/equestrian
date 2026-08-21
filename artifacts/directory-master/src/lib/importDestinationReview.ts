export interface ImportReviewMapping {
  csvColumn: string;
  targetField: string;
  approved: boolean;
}

export interface ImportDestinationBreakdown {
  columns: string[];
  type: "state" | "category" | "mixed" | "none";
  counts: Map<string, number>;
  noDestCount: number;
  totalRows: number;
  sourceRows: number;
  skippedUntitledRows: number;
  hasTitleMapping: boolean;
}

// Full CSV parser — handles quoted fields that contain embedded newlines and commas.
export function parseCSVRows(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (ch === "\n") {
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.some((field) => field !== "")) rows.push(currentRow);
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((field) => field !== "")) rows.push(currentRow);
  return rows;
}

export function buildImportDestinationBreakdown(
  csvContent: string,
  mappings: ImportReviewMapping[],
): ImportDestinationBreakdown | null {
  const content = csvContent.trim();
  if (!content || mappings.length === 0) return null;

  const allRows = parseCSVRows(content);
  if (allRows.length < 2) return null;

  const headers = allRows[0];
  const dataRows = allRows.slice(1);
  // Replay applyMappings exactly, including duplicate target mappings and
  // duplicate CSV header names. Each header position uses mappings.find by
  // name, and a later mapped position overwrites the earlier value.
  const mappedHeaders = headers.map((header, index) => ({
    header,
    index,
    mapping: mappings.find((candidate) => candidate.csvColumn === header),
  }));
  const hasMapping = (targetField: string) =>
    mappedHeaders.some(
      ({ mapping }) => mapping?.approved && mapping.targetField === targetField,
    );
  const mappedValue = (row: string[], targetField: string) => {
    let value = "";
    for (const { index, mapping } of mappedHeaders) {
      if (mapping?.approved && mapping.targetField === targetField) {
        value = (row[index] ?? "").trim();
      }
    }
    return value;
  };
  const mappedColumns = (targetField: string) => [
    ...new Set(
      mappedHeaders
        .filter(
          ({ mapping }) => mapping?.approved && mapping.targetField === targetField,
        )
        .map(({ header }) => header),
    ),
  ];
  const counts = new Map<string, number>();
  let noDestCount = 0;
  let totalRows = 0;
  let skippedUntitledRows = 0;
  let stateRows = 0;
  let categoryRows = 0;

  for (const row of dataRows) {
    const title = mappedValue(row, "title");
    if (!title) {
      skippedUntitledRows++;
      continue;
    }

    totalRows++;
    const state = mappedValue(row, "location_state");
    const category = mappedValue(row, "category");
    const destination = state || category;

    if (!destination) {
      noDestCount++;
      continue;
    }

    if (state) stateRows++;
    else categoryRows++;
    counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }

  const type =
    stateRows > 0 && categoryRows > 0
      ? "mixed"
      : stateRows > 0
        ? "state"
        : categoryRows > 0
          ? "category"
          : "none";

  return {
    columns: [
      ...mappedColumns("location_state"),
      ...mappedColumns("category"),
    ],
    type,
    counts,
    noDestCount,
    totalRows,
    sourceRows: dataRows.length,
    skippedUntitledRows,
    hasTitleMapping: hasMapping("title"),
  };
}