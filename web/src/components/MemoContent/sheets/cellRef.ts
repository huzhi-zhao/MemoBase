// Converts a zero-based column index to a spreadsheet column label (0 → A,
// 25 → Z, 26 → AA), and builds an A1-style cell reference.
export function columnLabel(colIndex: number): string {
  let n = colIndex;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export function cellRef(rowIndex: number, colIndex: number): string {
  return `${columnLabel(colIndex)}${rowIndex + 1}`;
}
