// String-level edits to a ```sheets fenced block within a memo's raw markdown.
// Sheet data is serialized back to `sheet:Name` + CSV, and only the fenced
// block's lines are replaced in the surrounding markdown (mirroring the kanban
// block's locate-fence / rebuild-content approach).

import Papa from "papaparse";
import type { Sheet, SheetsData } from "./types";

// Matches the opening fence, capturing any trailing meta (the info string after
// the `sheets` language token, e.g. `id=1zu8fb`).
const FENCE_START_RE = /^```sheets(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE_END_RE = /^```\s*$/;
const FENCE_ID_RE = /(?:^|\s)id=([A-Za-z0-9_-]+)/;

// Reads the block id from a fence's meta string (`id=xxx`). Undefined if absent.
export function parseFenceId(meta: string | undefined): string | undefined {
  if (!meta) return undefined;
  const m = FENCE_ID_RE.exec(meta);
  return m ? m[1] : undefined;
}

interface SheetsFenceLocation {
  lines: string[];
  fenceStart: number;
  fenceEnd: number;
}

function locateSheetsFence(content: string): SheetsFenceLocation | undefined {
  const lines = content.split("\n");
  const fenceStart = lines.findIndex((line) => FENCE_START_RE.test(line));
  if (fenceStart === -1) return undefined;

  let fenceEnd = -1;
  for (let i = fenceStart + 1; i < lines.length; i++) {
    if (FENCE_END_RE.test(lines[i])) {
      fenceEnd = i;
      break;
    }
  }
  if (fenceEnd === -1) return undefined;

  return { lines, fenceStart, fenceEnd };
}

// Trailing all-empty rows and trailing all-empty columns are dropped so the
// spreadsheet's default padded grid doesn't bloat the source with blank cells.
function trimGrid(rows: string[][]): string[][] {
  let lastRow = -1;
  let lastCol = -1;
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell !== "") {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    });
  });
  if (lastRow === -1) return [];
  return rows.slice(0, lastRow + 1).map((row) => {
    const out = row.slice(0, lastCol + 1);
    while (out.length < lastCol + 1) out.push("");
    return out;
  });
}

export function serializeSheets(data: SheetsData): string {
  const parts: string[] = [];

  data.sheets.forEach((sheet: Sheet, index) => {
    if (index > 0) parts.push("");
    parts.push(`sheet:${sheet.name}`);
    const grid = trimGrid(sheet.rows);
    if (grid.length > 0) {
      parts.push(Papa.unparse(grid, { newline: "\n" }));
    }
  });

  // View config trails the sheets as an indented `view:` block. The block id is
  // NOT written here — it lives on the fence's info string (see writeSheetsBlock),
  // so the content body stays free of the anchor.
  const viewLines: string[] = [];
  if (data.view.lock) viewLines.push("  lock: true");
  if (viewLines.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("view:", ...viewLines);
  }

  return parts.join("\n");
}

// Serializes `data` and splices it back into the `sheets` fence inside `content`,
// returning the full updated memo content. Returns `content` unchanged if no
// fence is found.
export function writeSheetsBlock(content: string, data: SheetsData): string {
  const location = locateSheetsFence(content);
  if (!location) return content;
  const { lines, fenceStart, fenceEnd } = location;
  const newBlockLines = serializeSheets(data).split("\n");

  // Rebuild the fence line so it carries `id=<id>` in its info string, preserving
  // any other meta tokens the fence already had (dropping a stale id first).
  const existingMeta = FENCE_START_RE.exec(lines[fenceStart])?.[1] ?? "";
  const otherMeta = existingMeta.replace(FENCE_ID_RE, "").trim();
  const metaParts = [otherMeta, data.view.id ? `id=${data.view.id}` : ""].filter(Boolean);
  const fenceLine = metaParts.length > 0 ? `\`\`\`sheets ${metaParts.join(" ")}` : "```sheets";

  return [...lines.slice(0, fenceStart), fenceLine, ...newBlockLines, ...lines.slice(fenceEnd)].join("\n");
}
