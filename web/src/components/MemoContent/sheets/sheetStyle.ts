// Cell-style overlay for a `sheets` block.
//
// The block's fenced CSV holds only raw cell text (data). Formatting the user
// applies through the spreadsheet UI — bold, colors, number formats, borders,
// merged ranges, column widths, row heights — is stored *separately* as this
// overlay, keyed in the memo's `node_overlays` map under the block's `view.id`.
// Data and presentation stay decoupled: the CSV round-trips untouched, and the
// overlay is opaque JSON the backend never parses.
//
// The overlay mirrors x-spreadsheet's own data shape (styles table + per-cell
// style index + merges/cols/rows) minus cell text, so restoring it is a direct
// splice back into the `loadData` payload.

import type { XSheet, XStyle } from "./toSpreadsheetData";

export interface SheetStyle {
  styles?: XStyle[];
  merges?: string[];
  cols?: Record<string, { width?: number }>;
  rows?: Record<string, { height?: number; cells?: Record<string, number> }>;
  // Cell comments, keyed "ri,ci". x-spreadsheet has no comment support at all
  // (its DataProxy declares a `comments` field but nothing ever reads it), so
  // unlike everything else here these never round-trip through the widget's own
  // data — we keep them in the overlay and render them ourselves.
  comments?: Record<string, string>;
}

// Comments for a whole block, keyed by sheet name then by "ri,ci".
export type SheetsComments = Record<string, Record<string, string>>;

export function commentKey(ri: number, ci: number): string {
  return `${ri},${ci}`;
}

// Keyed by sheet name. `v` is a schema version for forward migrations.
// `viewHeight` and `activeSheet` are block-level (not per-sheet) view state:
// the grid viewport height the user last dragged the bottom handle to, in
// pixels, and the name of the tab they last had open. Both are omitted when
// they match the default (DEFAULT_HEIGHT / the first sheet), so a plain
// untouched grid still writes no overlay at all.
export interface SheetsStyleOverlay {
  v: 1;
  sheets: Record<string, SheetStyle>;
  viewHeight?: number;
  activeSheet?: string;
}

// Block-level view state persisted alongside the cell styles.
export interface SheetsViewState {
  viewHeight?: number;
  activeSheet?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads style data out of an x-spreadsheet getData() result, plus the block's
// current view state. Returns undefined when no sheet carries any styling and
// no view state was set, so a plain data grid writes no overlay.
export function extractSheetsStyle(
  xsheets: XSheet[],
  view: SheetsViewState = {},
  comments: SheetsComments = {},
): SheetsStyleOverlay | undefined {
  const { viewHeight, activeSheet } = view;
  const sheets: Record<string, SheetStyle> = {};

  xsheets.forEach((xsheet, index) => {
    const name = xsheet.name || `Sheet${index + 1}`;
    const style: SheetStyle = {};

    if (Array.isArray(xsheet.styles) && xsheet.styles.length > 0) style.styles = xsheet.styles;
    if (Array.isArray(xsheet.merges) && xsheet.merges.length > 0) style.merges = xsheet.merges;
    if (isPlainObject(xsheet.cols) && Object.keys(xsheet.cols).length > 0) style.cols = xsheet.cols;

    const rowsObj = xsheet.rows ?? {};
    const rows: Record<string, { height?: number; cells?: Record<string, number> }> = {};
    for (const key of Object.keys(rowsObj)) {
      if (key === "len") continue;
      const xrow = (rowsObj as Record<string, unknown>)[key];
      if (!isPlainObject(xrow)) continue;
      const entry: { height?: number; cells?: Record<string, number> } = {};
      if (typeof xrow.height === "number") entry.height = xrow.height;
      const cells = isPlainObject(xrow.cells) ? (xrow.cells as Record<string, unknown>) : {};
      const cellStyles: Record<string, number> = {};
      for (const c of Object.keys(cells)) {
        const cell = cells[c];
        if (isPlainObject(cell) && typeof cell.style === "number") cellStyles[c] = cell.style;
      }
      if (Object.keys(cellStyles).length > 0) entry.cells = cellStyles;
      if (entry.height != null || entry.cells) rows[key] = entry;
    }
    if (Object.keys(rows).length > 0) style.rows = rows;

    const sheetComments = comments[name];
    if (sheetComments && Object.keys(sheetComments).length > 0) style.comments = { ...sheetComments };

    if (Object.keys(style).length > 0) sheets[name] = style;
  });

  if (Object.keys(sheets).length === 0 && viewHeight == null && activeSheet == null) return undefined;
  const overlay: SheetsStyleOverlay = { v: 1, sheets };
  if (viewHeight != null) overlay.viewHeight = viewHeight;
  if (activeSheet != null) overlay.activeSheet = activeSheet;
  return overlay;
}

// Splices overlay style back into the XSheet[] built from CSV, mutating it in
// place so the result can be handed straight to loadData. Style-only cells
// (formatted but empty) get an entry created so their style index survives.
export function applySheetsStyle(xsheets: XSheet[], overlay: SheetsStyleOverlay | undefined): void {
  if (!overlay) return;
  xsheets.forEach((xsheet, index) => {
    const name = xsheet.name || `Sheet${index + 1}`;
    const style = overlay.sheets[name];
    if (!style) return;

    if (style.styles) xsheet.styles = style.styles;
    if (style.merges) xsheet.merges = style.merges;
    if (style.cols) xsheet.cols = style.cols;

    if (style.rows) {
      const rows = (xsheet.rows ?? {}) as Record<number, { cells?: Record<number, { text?: string; style?: number }>; height?: number }>;
      xsheet.rows = rows;
      const styleRows: Record<string, { height?: number; cells?: Record<string, number> }> = style.rows;
      for (const rKey of Object.keys(styleRows)) {
        const r = Number(rKey);
        if (Number.isNaN(r)) continue;
        const rowStyle = styleRows[rKey];
        const row = rows[r] ?? {};
        rows[r] = row;
        if (rowStyle.height != null) row.height = rowStyle.height;
        if (rowStyle.cells) {
          const cells = row.cells ?? {};
          row.cells = cells;
          const styleCells: Record<string, number> = rowStyle.cells;
          for (const cKey of Object.keys(styleCells)) {
            const c = Number(cKey);
            if (Number.isNaN(c)) continue;
            const cell = cells[c] ?? {};
            cells[c] = cell;
            cell.style = styleCells[cKey];
          }
        }
      }
    }
  });
}

// Parses an overlay JSON string from the memo's node_overlays map, tolerating
// anything malformed by returning undefined (the block just renders unstyled).
export function parseStyleOverlay(json: string | undefined): SheetsStyleOverlay | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    if (isPlainObject(parsed) && isPlainObject(parsed.sheets)) {
      const overlay: SheetsStyleOverlay = { v: 1, sheets: parsed.sheets as Record<string, SheetStyle> };
      if (typeof parsed.viewHeight === "number" && parsed.viewHeight > 0) overlay.viewHeight = parsed.viewHeight;
      if (typeof parsed.activeSheet === "string" && parsed.activeSheet !== "") overlay.activeSheet = parsed.activeSheet;
      return overlay;
    }
  } catch {
    // fall through
  }
  return undefined;
}

// Pulls just the comments out of a parsed overlay, dropping anything that isn't
// a non-empty string so a hand-edited overlay can't feed junk to the renderer.
export function readSheetsComments(overlay: SheetsStyleOverlay | undefined): SheetsComments {
  const result: SheetsComments = {};
  if (!overlay) return result;
  for (const [name, style] of Object.entries(overlay.sheets)) {
    const raw = style?.comments;
    if (!isPlainObject(raw)) continue;
    const cells: Record<string, string> = {};
    for (const [key, text] of Object.entries(raw)) {
      if (typeof text === "string" && text !== "") cells[key] = text;
    }
    if (Object.keys(cells).length > 0) result[name] = cells;
  }
  return result;
}

export function serializeStyleOverlay(overlay: SheetsStyleOverlay): string {
  return JSON.stringify(overlay);
}
