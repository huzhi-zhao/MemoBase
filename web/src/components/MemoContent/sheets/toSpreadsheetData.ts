// Maps between our structured Sheet[] and the data shape x-data-spreadsheet
// consumes via `loadData` / emits via `getData`.
//
// x-spreadsheet sheet shape (only the fields we use):
//   { name, rows: { [rowIndex]: { cells: { [colIndex]: { text } } }, len } }
//
// We read `cell.text` (the raw entered value, formula string included) rather
// than any computed value, so formulas survive the CSV round-trip.

import type { Sheet, SheetsData } from "./types";

interface XCell {
  text?: string;
  // Index into the sheet's `styles` table. Carried by the style overlay, not CSV.
  style?: number;
}
interface XRow {
  cells?: Record<number, XCell>;
  height?: number;
}
// An x-spreadsheet cell style object. Opaque passthrough — we never inspect its
// fields, only store and restore them, so the full x-spreadsheet style surface
// (bold, color, bgcolor, format, border, align, …) is preserved.
export type XStyle = Record<string, unknown>;
export interface XSheet {
  name?: string;
  rows?: Record<number, XRow> & { len?: number };
  // Style-side fields, populated from the overlay (see sheetStyle.ts).
  styles?: XStyle[];
  merges?: string[];
  cols?: Record<string, { width?: number }>;
}

export function toSpreadsheetData(data: SheetsData): XSheet[] {
  const sheets = data.sheets.length > 0 ? data.sheets : [{ name: "Sheet1", rows: [] as string[][] }];
  return sheets.map((sheet) => {
    const rows: Record<number, XRow> = {};
    sheet.rows.forEach((row, r) => {
      const cells: Record<number, XCell> = {};
      row.forEach((text, c) => {
        if (text !== "") cells[c] = { text };
      });
      rows[r] = { cells };
    });
    return { name: sheet.name, rows };
  });
}

function isXRow(value: unknown): value is XRow {
  return typeof value === "object" && value !== null;
}

export function fromSpreadsheetData(xsheets: XSheet[]): Sheet[] {
  return xsheets.map((xsheet, index) => {
    const rowsObj = xsheet.rows ?? {};
    const rowIndices = Object.keys(rowsObj)
      .filter((key) => key !== "len")
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    const maxRow = rowIndices.length > 0 ? Math.max(...rowIndices) : -1;

    const rows: string[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      const xrow = (rowsObj as Record<number, unknown>)[r];
      const cells = isXRow(xrow) ? (xrow.cells ?? {}) : {};
      const colIndices = Object.keys(cells)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
      const maxCol = colIndices.length > 0 ? Math.max(...colIndices) : -1;
      const row: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        row.push(cells[c]?.text ?? "");
      }
      rows.push(row);
    }

    return { name: xsheet.name || `Sheet${index + 1}`, rows };
  });
}
