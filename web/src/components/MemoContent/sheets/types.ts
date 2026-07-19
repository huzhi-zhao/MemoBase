// A single sheet: a name plus a dense 2D grid of raw cell strings. Cell values
// are kept as raw text (including leading `=` for formulas) so a CSV round-trip
// never collapses a formula into its computed value.
export interface Sheet {
  name: string;
  rows: string[][];
}

export interface SheetsView {
  // When true the grid is view-only: cells can't be edited, but the height
  // handle can still be dragged (the height is persisted in node_overlays).
  lock: boolean;
  // Stable node anchor id for this block. Used as the key under which the memo's
  // `node_overlays` map holds this block's cell-style overlay (see sheetStyle.ts).
  // Assigned lazily the first time a style is applied.
  id?: string;
}

export interface SheetsData {
  sheets: Sheet[];
  view: SheetsView;
}
