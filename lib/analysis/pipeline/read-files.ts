/**
 * Чтение Excel-файла отчёта OZON → AOA (array-of-arrays) + период из A1.
 *
 * Разделено от нормализации: здесь — только I/O и формат,
 * никакой логики колонок/категорий.
 */

import * as XLSX from "xlsx";
import * as cptable from "codepage";
import { parseXlsxToAOA } from "../parsers/xlsx-raw-parser";

export interface RawSheet {
  sourceFile: string;
  sourceSize: number;
  rows: any[][];
  /** Содержимое A1 как пришло (ещё не декодировано). */
  a1Label: string;
}

export interface SourceFile {
  name: string;
  buffer: Buffer;
}

/**
 * Читает один файл (.xlsx или .xls). Возвращает первый лист как AOA.
 */
export async function readReportFile(source: SourceFile): Promise<RawSheet> {
  const lower = source.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isXls = lower.endsWith(".xls");

  if (!isXlsx && !isXls) {
    throw new Error(`Неподдерживаемый формат файла: ${source.name}`);
  }

  let rows: any[][] = [];
  let a1Label = "";

  if (isXlsx) {
    const parsed = await parseXlsxToAOA(source.buffer);
    rows = parsed.rows;
    a1Label = rows?.[0]?.[0] != null ? String(rows[0][0]) : "";
  } else {
    (XLSX as any).set_cptable?.(cptable);
    const workbook = XLSX.read(source.buffer, {
      type: "buffer",
      cellDates: true,
      codepage: 1251,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    a1Label = worksheet["A1"]?.v != null ? String(worksheet["A1"].v) : "";
    rows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
    });
  }

  return {
    sourceFile: source.name,
    sourceSize: source.buffer.length,
    rows,
    a1Label,
  };
}

/** Асинхронно читает список файлов последовательно. */
export async function readReportFiles(sources: SourceFile[]): Promise<RawSheet[]> {
  const out: RawSheet[] = [];
  for (const s of sources) {
    out.push(await readReportFile(s));
  }
  return out;
}
