import Papa from "papaparse";

const MAX_ROWS = 50;
const MAX_CHARS = 4000;

// Renders sheet rows as CSV for use as AI context. Bounded by a row cap and a
// character cap so a large sheet can't blow up the prompt; truncation is marked
// so the model knows the data continues.
export function serializeSheetCsv(rows: string[][]): string {
  const capped = rows.slice(0, MAX_ROWS);
  let csv = Papa.unparse(capped, { newline: "\n" });
  const truncatedRows = rows.length > MAX_ROWS;
  if (csv.length > MAX_CHARS) {
    csv = `${csv.slice(0, MAX_CHARS)}\n… (truncated)`;
  } else if (truncatedRows) {
    csv += `\n… (${rows.length - MAX_ROWS} more rows)`;
  }
  return csv;
}
