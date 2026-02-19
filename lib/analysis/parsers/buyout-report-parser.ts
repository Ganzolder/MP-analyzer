/**
 * Парсер отчётов о выкупленных товарах (Ozon RealizationReportCIS).
 *
 * Формат файла:
 *  - Строки 1..12 — шапка документа (заголовок, реквизиты, итоги).
 *  - Строка 11 (0-based ~10) — строка заголовков таблицы:
 *      № п/п | Товар | Код товара продавца | Код товара OZON | Номер отправления | ...
 *  - Строка 12 (0-based ~11) — подзаголовки (нумерация 1..11).
 *  - Строки 13+ — данные.
 *
 * Нужные столбцы (1-based по нумерации в документе):
 *  - Столбец 5 (E, 0-based index 4): Номер отправления
 *  - Столбец 11 (K, 0-based index 10): Итого к начислению, руб.
 *
 * Результат: Map<orderNumber, totalAccrual> —
 *   агрегированная сумма начислений по номеру отправления.
 */

import { parseXlsxToAOA } from "./xlsx-raw-parser";

export interface BuyoutEntry {
  shipmentNumber: string;
  accrualAmount: number;
}

export interface BuyoutParseResult {
  entries: BuyoutEntry[];
  /** Суммы агрегированные по номеру отправления */
  byShipment: Map<string, number>;
  totalAccrual: number;
  rowsParsed: number;
  errors: string[];
}

/**
 * Парсит XLSX-файл отчёта о выкупленных товарах.
 * Принимает Buffer (серверная сторона) или File (клиентская).
 */
export async function parseBuyoutReport(
  file: File | Buffer,
  fileName: string
): Promise<BuyoutParseResult> {
  let buffer: Buffer;

  if (file instanceof File) {
    const ab = await file.arrayBuffer();
    buffer = Buffer.from(ab);
  } else {
    buffer = file;
  }

  const isXlsx = fileName.toLowerCase().endsWith(".xlsx");
  if (!isXlsx) {
    throw new Error(`Неподдерживаемый формат файла: ${fileName}. Ожидается .xlsx`);
  }

  const parsed = await parseXlsxToAOA(buffer);
  const rawData = parsed.rows;

  if (!rawData || rawData.length === 0) {
    throw new Error(`Файл ${fileName} пуст или не содержит данных`);
  }

  // Ищем строку-заголовок таблицы.
  // Она содержит «Номер отправления» или «№ п/п» + дальше «Товар».
  let headerRowIdx = -1;
  let shipmentColIdx = -1;
  let accrualColIdx = -1;

  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    const cells = row.map((c) => String(c || "").toLowerCase().trim());

    // Ищем столбец «Номер отправления»
    const shipIdx = cells.findIndex(
      (c) => c.includes("номер отправления") || c.includes("номер отправл")
    );
    // Ищем столбец «Итого к начислению»
    const accIdx = cells.findIndex(
      (c) =>
        (c.includes("итого") && c.includes("начислен")) ||
        (c.includes("итого к начислению"))
    );

    if (shipIdx !== -1 && accIdx !== -1) {
      headerRowIdx = i;
      shipmentColIdx = shipIdx;
      accrualColIdx = accIdx;
      break;
    }
  }

  // Если заголовки не найдены по тексту — используем фиксированные позиции по формату документа
  if (headerRowIdx === -1) {
    // Столбец F (index 5) = Номер отправления, столбец L (index 11) = Итого к начислению
    headerRowIdx = findDataStartRow(rawData);
    shipmentColIdx = 5;
    accrualColIdx = 11;
  }

  const entries: BuyoutEntry[] = [];
  const byShipment = new Map<string, number>();
  const errors: string[] = [];
  let totalAccrual = 0;

  // Парсим строки данных (начинаем после заголовка + подзаголовка)
  const dataStartRow = headerRowIdx + 2; // +1 заголовок, +1 подзаголовок с нумерацией
  for (let i = dataStartRow; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;

    const shipmentRaw = String(row[shipmentColIdx] || "").trim();
    const accrualRaw = row[accrualColIdx];

    if (!shipmentRaw) continue;

    // Пропускаем строку «Итого с НДС» и прочие итоговые строки
    if (shipmentRaw.toLowerCase().includes("итого")) continue;

    // Извлекаем номер заказа из номера отправления
    // Формат: 01234567890123-0001 — берём как есть, это и есть идентификатор
    const shipmentNumber = extractShipmentOrderNumber(shipmentRaw);
    if (!shipmentNumber) continue;

    const amount = parseAccrualNumber(accrualRaw);
    if (isNaN(amount)) {
      errors.push(`Строка ${i + 1}: не удалось распознать сумму "${accrualRaw}" для отправления ${shipmentRaw}`);
      continue;
    }

    entries.push({ shipmentNumber, accrualAmount: amount });
    totalAccrual += amount;

    const existing = byShipment.get(shipmentNumber) || 0;
    byShipment.set(shipmentNumber, existing + amount);
  }

  console.log(
    `📦 [BuyoutParser] ${fileName}: ${entries.length} строк, ${byShipment.size} уникальных отправлений, сумма: ${totalAccrual.toFixed(2)} ₽`
  );

  return { entries, byShipment, totalAccrual, rowsParsed: entries.length, errors };
}

/**
 * Извлекает номер заказа из номера отправления.
 * Номер может быть числовой строкой вида "01478917-0112-1" или "01478917-0112".
 * Убираем последний суффикс «-N» если есть, чтобы сопоставить с основными отчётами.
 */
function extractShipmentOrderNumber(raw: string): string | null {
  const s = raw.replace(/\s/g, "").trim();
  if (!s) return null;

  // Формат Ozon: NNNNNNNN-NNNN или NNNNNNNN-NNNN-N
  // Аналогично extractOrderNumber из constants.ts
  const match = s.match(/^(\d+-\d+)(?:-\d+)?$/);
  if (match) return match[1];

  // Если просто числовая строка — возвращаем как есть
  if (/^\d[\d\-]+$/.test(s)) return s;

  return null;
}

function parseAccrualNumber(val: any): number {
  if (typeof val === "number") return val;
  if (val === null || val === undefined || val === "") return NaN;
  const s = String(val).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return n;
}

/**
 * Ищет первую строку данных (после шапки документа).
 * Шапка обычно содержит «Отчёт о выкупленных» или «Реализация товаров».
 */
function findDataStartRow(rawData: any[][]): number {
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const row = rawData[i];
    if (!row || !Array.isArray(row)) continue;
    const cells = row.map((c) => String(c || "").toLowerCase().trim());
    // Ищем строку с «№ п/п» — это заголовок таблицы
    if (cells.some((c) => c.includes("№ п/п") || c.includes("n п/п"))) {
      return i;
    }
  }
  return 10; // Дефолт: строка 11 (0-based 10) по формату документа
}

/**
 * Парсит несколько файлов выкупов и объединяет результаты.
 */
export async function parseBuyoutFiles(
  files: File[],
): Promise<BuyoutParseResult> {
  const combinedByShipment = new Map<string, number>();
  const allEntries: BuyoutEntry[] = [];
  const allErrors: string[] = [];
  let totalAccrual = 0;
  let totalRows = 0;

  for (const file of files) {
    try {
      const result = await parseBuyoutReport(file, file.name);
      allEntries.push(...result.entries);
      allErrors.push(...result.errors);
      totalAccrual += result.totalAccrual;
      totalRows += result.rowsParsed;

      for (const [key, val] of result.byShipment) {
        const existing = combinedByShipment.get(key) || 0;
        combinedByShipment.set(key, existing + val);
      }
    } catch (err: any) {
      allErrors.push(`Ошибка файла ${file.name}: ${err.message}`);
    }
  }

  console.log(
    `📦 [BuyoutParser] Итого: ${files.length} файлов, ${totalRows} строк, ${combinedByShipment.size} отправлений, ${totalAccrual.toFixed(2)} ₽`
  );

  return {
    entries: allEntries,
    byShipment: combinedByShipment,
    totalAccrual,
    rowsParsed: totalRows,
    errors: allErrors,
  };
}
