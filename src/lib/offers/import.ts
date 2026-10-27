import "server-only";

/**
 * Inventory parsing for the Sales Offer Generator.
 *
 * - CSV / XLSX / XLS: real spreadsheet parsing via SheetJS, with header
 *   detection and an explicit mapping report.
 * - PDF: text extraction via PDF.js (unpdf). Tables in PDFs are heuristic, so
 *   rows are only returned when a header + numeric unit numbers are found;
 *   otherwise the extracted text is returned for the admin to correct manually.
 *
 * Nothing is written to the database here. Importing is a two-step flow:
 * parse → review/map → explicit commit, which never overwrites existing units
 * unless the admin selected "update".
 */

export type ParsedUnitRow = {
  unitNo: string;
  unitType?: string;
  bedrooms?: string;
  area?: number | null;
  areaUnit?: string;
  floor?: string;
  view?: string;
  price?: number | null;
  status?: string;
  warnings: string[];
  duplicateInFile: boolean;
};

export type InventoryParseResult = {
  source: "csv" | "xlsx" | "pdf" | "unknown";
  columns: string[];
  mapping: Record<string, string | null>;
  rows: ParsedUnitRow[];
  errors: string[];
  warnings: string[];
  extractedText?: string;
};

const ALIASES: Record<string, string[]> = {
  unitNo: ["unitno", "unitnumber", "unit", "no", "number", "apartment", "apt", "apartmentno", "unitcode", "plot"],
  unitType: ["type", "unittype", "typology", "propertytype", "layout"],
  bedrooms: ["bedrooms", "bedroom", "beds", "bed", "br", "bhk"],
  area: ["area", "size", "sqft", "sqm", "builtuparea", "bua", "area(sqft)", "areainsqft", "netarea"],
  areaUnit: ["areaunit", "unitofmeasure", "uom"],
  floor: ["floor", "level", "floorno"],
  view: ["view", "facing", "aspect"],
  price: ["price", "amount", "totalprice", "unitprice", "cost", "value", "askingprice"],
  status: ["status", "availability", "unitstatus"],
  currency: ["currency", "ccy"],
};

function key(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\s+/g, " ").trim();
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function detectMapping(header: unknown[]): { mapping: Record<string, number | null>; recognized: number } {
  const mapping: Record<string, number | null> = {};
  const keys = header.map(key);
  let recognized = 0;
  for (const [field, aliases] of Object.entries(ALIASES)) {
    let index: number | null = null;
    for (const alias of aliases) {
      const at = keys.findIndex((k) => k === alias);
      if (at >= 0) {
        index = at;
        break;
      }
    }
    // Looser second pass, but still deterministic (first match wins).
    if (index == null) {
      for (const alias of aliases) {
        const at = keys.findIndex((k) => k.includes(alias));
        if (at >= 0) {
          index = at;
          break;
        }
      }
    }
    mapping[field] = index;
    if (index != null) recognized++;
  }
  return { mapping, recognized };
}

function rowsFromMatrix(matrix: unknown[][], columns: string[], mapping: Record<string, number | null>, errors: string[], warnings: string[], headerRowIndex: number): ParsedUnitRow[] {
  const rows: ParsedUnitRow[] = [];
  const seen = new Map<string, number>();
  const unitNoIndex = mapping.unitNo;
  if (unitNoIndex == null) {
    errors.push("No unit-number column was found. Include a header such as “Unit No” and try again.");
    return rows;
  }

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (!Array.isArray(raw) || raw.every((c) => cellText(c) === "")) continue;
    const unitNo = cellText(raw[unitNoIndex]);
    if (!unitNo) continue;
    const rowWarnings: string[] = [];
    const price = mapping.price != null ? parseAmount(raw[mapping.price]) : null;
    const area = mapping.area != null ? parseAmount(raw[mapping.area]) : null;
    if (price != null && price <= 0) rowWarnings.push("Price is zero or negative.");
    if (area != null && area <= 0) rowWarnings.push("Area is zero or negative.");

    const prior = seen.get(unitNo.toLowerCase());
    if (prior != null) rowWarnings.push(`Duplicate unit number (also row ${prior + 1}).`);
    else seen.set(unitNo.toLowerCase(), i);

    rows.push({
      unitNo: unitNo.slice(0, 40),
      unitType: mapping.unitType != null ? cellText(raw[mapping.unitType]) || undefined : undefined,
      bedrooms: mapping.bedrooms != null ? cellText(raw[mapping.bedrooms]) || undefined : undefined,
      area,
      areaUnit: mapping.areaUnit != null ? cellText(raw[mapping.areaUnit]) || undefined : undefined,
      floor: mapping.floor != null ? cellText(raw[mapping.floor]) || undefined : undefined,
      view: mapping.view != null ? cellText(raw[mapping.view]) || undefined : undefined,
      price,
      status: mapping.status != null ? cellText(raw[mapping.status]) || undefined : undefined,
      warnings: rowWarnings,
      duplicateInFile: prior != null,
    });
  }

  if (rows.length === 0) errors.push("The sheet was read but no unit rows were found below the header.");
  if (rows.length > 2000) {
    errors.push(`This file contains ${rows.length} rows; the importer accepts 2,000 at a time.`);
    return [];
  }
  const unknownColumns = columns.slice(0, 25).filter((c) => !Object.entries(mapping).some(([, idx]) => idx != null && columns[idx] === c));
  if (unknownColumns.length) warnings.push(`Columns not imported: ${unknownColumns.join(", ")}.`);
  return rows;
}

function parseDelimited(text: string): unknown[][] | null {
  const clean = text.replace(/^\uFEFF/, "");
  if (!clean.trim()) return null;
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows.length ? rows : null;
}

export async function parseInventoryFile(bytes: Uint8Array, filename: string): Promise<InventoryParseResult> {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (ext === "pdf") {
    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const proxy = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(proxy, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } catch {
      return {
        source: "pdf",
        columns: [],
        mapping: {},
        rows: [],
        errors: ["This PDF's text could not be extracted (it may be a scanned image). Upload a CSV/XLSX export instead."],
        warnings,
      };
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const headerIndex = lines.findIndex((line) => {
      const k = key(line);
      return k.includes("unit") && (k.includes("price") || k.includes("type") || k.includes("area"));
    });
    if (headerIndex < 0) {
      return {
        source: "pdf",
        columns: [],
        mapping: {},
        rows: [],
        errors: [],
        warnings: ["PDF text was extracted, but no reliable inventory table header was found. Add units manually or upload a CSV/XLSX export."],
        extractedText: text.slice(0, 4000),
      };
    }
    const headerCells = lines[headerIndex].split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);
    const { mapping, recognized } = detectMapping(headerCells);
    const matrix: unknown[][] = [headerCells];
    for (const line of lines.slice(headerIndex + 1)) {
      const cells = line.split(/\s{2,}|\t|\|/).map((c) => c.trim());
      if (cells.length >= Math.max(2, Math.min(headerCells.length, 3))) matrix.push(cells);
    }
    if (recognized < 2 || mapping.unitNo == null) {
      return {
        source: "pdf",
        columns: headerCells,
        mapping: {},
        rows: [],
        errors: [],
        warnings: ["The PDF table could not be mapped with confidence. No rows were imported — use CSV/XLSX for exact inventory."],
        extractedText: text.slice(0, 4000),
      };
    }
    warnings.push("PDF inventory extraction is heuristic. Review every row before importing.");
    return { source: "pdf", columns: headerCells, mapping: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, v == null ? null : headerCells[v]])), rows: rowsFromMatrix(matrix, headerCells, mapping, errors, warnings, 0), errors, warnings, extractedText: text.slice(0, 4000) };
  }

  let matrix: unknown[][] | null = null;
  let source: InventoryParseResult["source"] = "unknown";

  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const text = new TextDecoder().decode(bytes);
    matrix = parseDelimited(text);
    source = "csv";
  } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return { source: "xlsx", columns: [], mapping: {}, rows: [], errors: ["The workbook has no sheets."], warnings };
      const sheet = workbook.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
      source = "xlsx";
      if (workbook.SheetNames.length > 1) warnings.push(`Only the first sheet (“${sheetName}”) was imported.`);
    } catch {
      return { source: "xlsx", columns: [], mapping: {}, rows: [], errors: ["The spreadsheet could not be read. Re-export it as .xlsx or CSV."], warnings };
    }
  } else {
    return { source: "unknown", columns: [], mapping: {}, rows: [], errors: [`Unsupported file type .${ext || "?"}. Upload CSV, XLSX or PDF.`], warnings };
  }

  if (!matrix || matrix.length === 0) {
    return { source, columns: [], mapping: {}, rows: [], errors: ["The file is empty."], warnings };
  }

  // Find the header row within the first 12 rows (many exports have a title row).
  let best: { index: number; mapping: Record<string, number | null>; recognized: number } | null = null;
  for (let i = 0; i < Math.min(12, matrix.length); i++) {
    const candidate = detectMapping(matrix[i] ?? []);
    if (candidate.mapping.unitNo != null && (!best || candidate.recognized > best.recognized)) best = { index: i, ...candidate };
  }
  if (!best) {
    return {
      source,
      columns: (matrix[0] ?? []).map(cellText),
      mapping: {},
      rows: [],
      errors: ["No header row with a unit number was found. Add a “Unit No” column or map the columns manually."],
      warnings,
    };
  }

  const columns = (matrix[best.index] ?? []).map(cellText);
  const rows = rowsFromMatrix(matrix, columns, best.mapping, errors, warnings, best.index);
  return {
    source,
    columns,
    mapping: Object.fromEntries(Object.entries(best.mapping).map(([k, v]) => [k, v == null ? null : columns[v]])),
    rows,
    errors,
    warnings,
  };
}
