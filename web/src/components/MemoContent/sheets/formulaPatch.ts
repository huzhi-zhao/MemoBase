// x-data-spreadsheet's formula engine looks up functions in a shared `formulam`
// object and calls `formulam[name].render(...)`. If a cell contains a function
// the engine doesn't know (SUMPRODUCT, VLOOKUP, COUNT, …) the lookup is
// undefined and `.render` throws "Cannot read properties of undefined
// (reading 'render')" — during a canvas draw, which takes down the whole page.
//
// We can't intercept the property access, but `formulam` is a shared, mutable
// object imported by reference in the library's renderer, so registering
// fallback entries makes unknown functions compute to a marker (or a best-effort
// value) instead of crashing. The cell's raw formula text is left untouched, so
// this is lossless on write-back.

// @ts-expect-error - deep import; this subpath ships no type declarations.
import { formulam } from "x-data-spreadsheet/src/core/formula";

type FormulaEntry = { key: string; title: () => string; render: (ary: unknown[]) => unknown };
const registry = formulam as Record<string, FormulaEntry>;

const toNum = (v: unknown): number => Number(v);
const nums = (ary: unknown[]): number[] => ary.map(toNum).filter((n) => !Number.isNaN(n));

// Best-effort implementations for common functions that operate on the flat
// argument list the engine passes. Anything not listed here (and not built in)
// falls back to the "#N/A" stub below.
const implementations: Record<string, (ary: unknown[]) => unknown> = {
  // x-spreadsheet ships PRODUCT/DIVIDE/SUBTRACT commented out (see
  // core/formula.js), yet the backend prompt and SUPPORTED_FUNCTIONS allow them,
  // so without these entries a "=PRODUCT(...)" the model returns crashes the
  // renderer. Register the implementations the library intended.
  PRODUCT: (ary) => nums(ary).reduce((a, b) => a * b, 1),
  DIVIDE: (ary) => nums(ary).reduce((a, b) => a / b),
  SUBTRACT: (ary) => nums(ary).reduce((a, b) => a - b),
  COUNT: (ary) => nums(ary).length,
  COUNTA: (ary) => ary.filter((v) => String(v ?? "").trim() !== "").length,
  ABS: (ary) => Math.abs(toNum(ary[0])),
  INT: (ary) => Math.floor(toNum(ary[0])),
  SQRT: (ary) => Math.sqrt(toNum(ary[0])),
  ROUND: (ary) => Math.round(toNum(ary[0])),
  ROUNDUP: (ary) => Math.ceil(toNum(ary[0])),
  ROUNDDOWN: (ary) => Math.floor(toNum(ary[0])),
  LEN: (ary) => String(ary[0] ?? "").length,
};

// Common function names that we don't compute but must not crash on.
const stubbed = [
  "SUMPRODUCT",
  "VLOOKUP",
  "HLOOKUP",
  "XLOOKUP",
  "LOOKUP",
  "INDEX",
  "MATCH",
  "COUNTIF",
  "COUNTIFS",
  "SUMIF",
  "SUMIFS",
  "AVERAGEIF",
  "IFERROR",
  "IFS",
  "POWER",
  "MOD",
  "MEDIAN",
  "MODE",
  "STDEV",
  "VAR",
  "RANK",
  "LARGE",
  "SMALL",
  "TEXT",
  "VALUE",
  "LEFT",
  "RIGHT",
  "MID",
  "TRIM",
  "UPPER",
  "LOWER",
  "CONCATENATE",
  "REPLACE",
  "SUBSTITUTE",
  "FIND",
  "SEARCH",
  "NOW",
  "TODAY",
  "DATE",
  "YEAR",
  "MONTH",
  "DAY",
  "WEEKDAY",
];

let patched = false;

// Registers fallback formula entries. Idempotent; safe to call on every mount.
// Never overrides a function the library already implements.
export function ensureFormulaFallbacks(): void {
  if (patched) return;
  patched = true;

  const register = (key: string, render: (ary: unknown[]) => unknown) => {
    if (registry[key]) return; // keep any built-in implementation
    registry[key] = { key, title: () => key, render };
  };

  for (const [key, render] of Object.entries(implementations)) {
    register(key, render);
  }
  for (const key of stubbed) {
    register(key, () => "#N/A");
  }
}
