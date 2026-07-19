import Papa from "papaparse";
import type { Sheet, SheetsData, SheetsView } from "./types";

// Parses a ```sheets fenced block into structured sheet data.
//
// Format:
//
//   sheet:Sheet One
//   a,b,c
//   1,2,3
//
//   sheet:Sheet Two
//   x,y
//   4,5
//
//   view:
//     lock: true
//
// Everything between one `sheet:` marker and the next section is parsed as CSV
// via papaparse. A `view:` section holds block-level view config (indented
// `key: value` lines). The grid's viewport height is NOT config here — it is
// persisted per block in the memo's `node_overlays` (see sheetStyle.ts). A block with no `sheet:` marker at all is treated as a
// single unnamed sheet. For backward compatibility, bare `lock:` / `height:`
// lines before the first section are also read as view config.

const SHEET_MARKER_RE = /^sheet:(.*)$/;
const VIEW_MARKER_RE = /^view:\s*$/;
const LOCK_RE = /^lock:\s*(true|false)\s*$/i;
const HEIGHT_RE = /^h(?:e)?ight:\s*\d+\s*$/i; // legacy in-body height lines, ignored on parse
const ID_RE = /^id:\s*([A-Za-z0-9_-]+)\s*$/;

interface RawSection {
  name: string;
  body: string;
}

function splitSections(content: string): { config: string[]; view: string[]; sections: RawSection[] } {
  const lines = content.split("\n");
  const config: string[] = [];
  const view: string[] = [];
  const sections: RawSection[] = [];
  let current: { name: string; lines: string[] } | undefined;
  let mode: "pre" | "sheet" | "view" = "pre";

  const flushSheet = () => {
    if (current) sections.push({ name: current.name, body: current.lines.join("\n") });
    current = undefined;
  };

  for (const line of lines) {
    const sheetMarker = SHEET_MARKER_RE.exec(line);
    if (sheetMarker) {
      flushSheet();
      current = { name: sheetMarker[1].trim(), lines: [] };
      mode = "sheet";
      continue;
    }
    if (VIEW_MARKER_RE.test(line)) {
      flushSheet();
      mode = "view";
      continue;
    }
    if (mode === "sheet" && current) {
      current.lines.push(line);
    } else if (mode === "view") {
      view.push(line);
    } else {
      // Lines before the first marker: backward-compatible bare view config.
      config.push(line);
    }
  }
  flushSheet();

  return { config, view, sections };
}

function parseView(configLines: string[], viewLines: string[]): SheetsView {
  const result: SheetsView = { lock: false };
  for (const line of [...configLines, ...viewLines]) {
    const trimmed = line.trim();
    const lock = LOCK_RE.exec(trimmed);
    if (lock) {
      result.lock = lock[1].toLowerCase() === "true";
      continue;
    }
    // Legacy `height:` lines are recognized only so they're skipped, never
    // treated as data. The viewport height now lives in the block's overlay.
    if (HEIGHT_RE.test(trimmed)) continue;
    const id = ID_RE.exec(trimmed);
    if (id) result.id = id[1];
  }
  return result;
}

function parseCsv(body: string): string[][] {
  // Trim leading/trailing blank lines that come from the marker/section split so
  // an empty sheet parses to zero rows instead of one blank row.
  const trimmed = body.replace(/^\n+/, "").replace(/\n+$/, "");
  if (trimmed === "") return [];
  const result = Papa.parse<string[]>(trimmed, { skipEmptyLines: "greedy" });
  return result.data.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
}

export function parseSheetsBlock(content: string): SheetsData {
  const { config, view, sections } = splitSections(content);
  const parsedView = parseView(config, view);

  const sheets: Sheet[] = [];

  if (sections.length === 0) {
    // No `sheet:` marker — treat the pre-section lines as one unnamed sheet, but
    // only the ones that aren't view config.
    const rows = parseCsv(
      config.filter((line) => !LOCK_RE.test(line.trim()) && !HEIGHT_RE.test(line.trim()) && !ID_RE.test(line.trim())).join("\n"),
    );
    if (rows.length > 0) sheets.push({ name: "Sheet1", rows });
  } else {
    sections.forEach((section, index) => {
      sheets.push({
        name: section.name || `Sheet${index + 1}`,
        rows: parseCsv(section.body),
      });
    });
  }

  return { sheets, view: parsedView };
}
