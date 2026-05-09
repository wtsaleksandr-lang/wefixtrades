/**
 * Browser-side CSV export.
 *
 * Used by admin pages that already have data in memory (TanStack
 * Query cache) so we don't need a server round-trip to export the
 * currently-visible page. For full-table exports the call site is
 * responsible for fetching all rows first — most admin lists already
 * paginate at 50–200 rows which is fine to export client-side.
 *
 * Usage:
 *   csvDownload({
 *     filename: `clients-${today()}.csv`,
 *     columns: [
 *       { header: "ID", value: (r) => r.id },
 *       { header: "Business", value: (r) => r.business_name },
 *       { header: "Created", value: (r) => r.created_at },
 *     ],
 *     rows,
 *   });
 */

export interface CsvColumn<Row> {
  /** Heading written in the first row of the CSV. */
  header: string;
  /**
   * Function that pulls a value out of one row. Return any primitive,
   * `null`, or `undefined`. Numbers are coerced to strings; nullish
   * values become empty cells.
   */
  value: (row: Row) => unknown;
}

export interface CsvDownloadOptions<Row> {
  /** Suggested download filename. Browsers may strip non-ASCII characters. */
  filename: string;
  columns: CsvColumn<Row>[];
  rows: Row[];
}

/**
 * Escape a single cell value for inclusion in a CSV file.
 * RFC 4180: cells containing comma / quote / newline are wrapped in
 * double-quotes, and any internal double-quote is doubled.
 */
function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build the CSV text body from typed rows + column descriptors. */
export function buildCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  }
  // Excel detects UTF-8 reliably when the file starts with a BOM,
  // and strips it during import — adding it costs us 3 bytes and
  // saves operators from "why are accents broken" tickets.
  return "﻿" + lines.join("\r\n");
}

export function csvDownload<Row>({ filename, columns, rows }: CsvDownloadOptions<Row>): void {
  const csv = buildCsv(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** "2026-05-08" — convenient for filenames. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
