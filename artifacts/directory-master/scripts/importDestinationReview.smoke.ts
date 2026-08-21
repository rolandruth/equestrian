import { buildImportDestinationBreakdown } from "../src/lib/importDestinationReview.js";

let passed = 0;

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  passed++;
}

const mappings = [
  { csvColumn: "Name", targetField: "title", approved: true },
  { csvColumn: "State", targetField: "location_state", approved: true },
  { csvColumn: "Category", targetField: "category", approved: true },
];

const alaskaRows = Array.from(
  { length: 18 },
  (_, index) => `Alaska Stable ${index + 1},Alaska,Alaska`,
);
const wrongFile = [
  "Name,State,Category",
  ...alaskaRows,
  "Florida Stable,Florida,Florida",
].join("\n");
const wrongFileResult = buildImportDestinationBreakdown(wrongFile, mappings);

assertEqual("wrong-file total", wrongFileResult?.totalRows, 19);
assertEqual(
  "wrong-file counts",
  Array.from(wrongFileResult?.counts.entries() ?? []),
  [["Alaska", 18], ["Florida", 1]],
);

const mixedFallback = [
  "Name,State,Category",
  "State Row,Texas,Texas",
  "Category Fallback,,Arkansas",
  ",Florida,Florida",
  "No Destination,,",
].join("\n");
const mixedResult = buildImportDestinationBreakdown(mixedFallback, mappings);

assertEqual("mixed importable rows", mixedResult?.totalRows, 3);
assertEqual("mixed skipped untitled rows", mixedResult?.skippedUntitledRows, 1);
assertEqual("mixed no-destination rows", mixedResult?.noDestCount, 1);
assertEqual("mixed source type", mixedResult?.type, "mixed");
assertEqual(
  "mixed per-row fallback counts",
  Array.from(mixedResult?.counts.entries() ?? []),
  [["Texas", 1], ["Arkansas", 1]],
);

const duplicateMappings = [
  { csvColumn: "Name", targetField: "title", approved: true },
  { csvColumn: "Final Name", targetField: "title", approved: true },
  { csvColumn: "State", targetField: "location_state", approved: true },
  { csvColumn: "Final State", targetField: "location_state", approved: true },
  { csvColumn: "Category", targetField: "category", approved: true },
];
const duplicateMappingCsv = [
  "Name,Final Name,State,Final State,Category",
  "Earlier Name,Final Name,Texas,Arkansas,Fallback",
  "Skipped Name,,Texas,,Florida",
].join("\n");
const duplicateResult = buildImportDestinationBreakdown(
  duplicateMappingCsv,
  duplicateMappings,
);

assertEqual("last title mapping controls importability", duplicateResult?.totalRows, 1);
assertEqual("overwritten blank title is skipped", duplicateResult?.skippedUntitledRows, 1);
assertEqual(
  "last state mapping wins",
  Array.from(duplicateResult?.counts.entries() ?? []),
  [["Arkansas", 1]],
);

const repeatedHeaderMappings = [
  { csvColumn: "Name", targetField: "title", approved: true },
  { csvColumn: "State", targetField: "location_state", approved: true },
  { csvColumn: "Category", targetField: "category", approved: true },
];
const repeatedHeaderCsv = [
  "Name,Name,State,State,Category",
  "Earlier Name,Final Name,Texas,Arkansas,Fallback",
  "Skipped Name,,Texas,Florida,Fallback",
].join("\n");
const repeatedHeaderResult = buildImportDestinationBreakdown(
  repeatedHeaderCsv,
  repeatedHeaderMappings,
);

assertEqual("duplicate-header later title wins", repeatedHeaderResult?.totalRows, 1);
assertEqual(
  "duplicate-header later blank title skips row",
  repeatedHeaderResult?.skippedUntitledRows,
  1,
);
assertEqual(
  "duplicate-header later state wins",
  Array.from(repeatedHeaderResult?.counts.entries() ?? []),
  [["Arkansas", 1]],
);

console.log(`Import destination review smoke test: ${passed} passed`);