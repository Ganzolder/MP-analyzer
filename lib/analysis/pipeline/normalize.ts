/**
 * Нормализация AOA (из одного файла) → ChargeLine[].
 *
 * 1) Находит строку заголовков в первых 5 рядах.
 * 2) Матчит 12 целевых колонок из ТЗ (+ несколько вспомогательных).
 * 3) Строит ChargeLine с orderKey/shipmentSuffix и категорией начисления.
 * 4) Строки "Баллы за скидки" помечаются isPoints=true (в рубли НЕ идут).
 */

import { fixEncoding } from "../encoding";
import { getNumber, getString, parseDate } from "../data-utils";
import { extractOrderKey, extractShipmentSuffix } from "../keys";
import { classifyChargeType } from "../charge-types";
import type { ChargeLine } from "../domain";
import type { RawSheet } from "./read-files";

export interface NormalizedSheet {
  sourceFile: string;
  sourceSize: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodLabel: string;
  charges: ChargeLine[];
}

interface ColumnPositions {
  chargeId: number;
  chargeDate: number;
  serviceGroup: number;
  chargeType: number;
  article: number;
  sku: number;
  productName: number;
  quantity: number;
  sellerPrice: number;
  orderDate: number;
  platform: number;
  workScheme: number;
  ozonCommissionPercent: number;
  localizationIndex: number;
  avgDeliveryHours: number;
  totalAmount: number;
}

function emptyPositions(): ColumnPositions {
  return {
    chargeId: -1,
    chargeDate: -1,
    serviceGroup: -1,
    chargeType: -1,
    article: -1,
    sku: -1,
    productName: -1,
    quantity: -1,
    sellerPrice: -1,
    orderDate: -1,
    platform: -1,
    workScheme: -1,
    ozonCommissionPercent: -1,
    localizationIndex: -1,
    avgDeliveryHours: -1,
    totalAmount: -1,
  };
}

/** Позиции по умолчанию — если заголовки не нашлись, но структура файла "как всегда". */
const FALLBACK_POSITIONS: ColumnPositions = {
  chargeId: 0,
  chargeDate: 1,
  serviceGroup: 2,
  chargeType: 3,
  article: 4,
  sku: 5,
  productName: 6,
  quantity: 7,
  sellerPrice: 8,
  orderDate: 9,
  platform: 10,
  workScheme: 11,
  ozonCommissionPercent: 12,
  localizationIndex: 13,
  avgDeliveryHours: 14,
  totalAmount: 15,
};

function normalizeHeader(value: any): string {
  return fixEncoding(String(value ?? "")).toLowerCase().trim();
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const joined = row.map(normalizeHeader).join(" ");
    if (joined.includes("id") && (joined.includes("начислен") || joined.includes("сумма"))) {
      return i;
    }
  }
  return 1;
}

function matchColumns(headerRow: any[]): ColumnPositions {
  const headers = headerRow.map(normalizeHeader);
  const find = (pred: (h: string) => boolean) => headers.findIndex(pred);

  const p = emptyPositions();
  p.chargeId = find((h) => h.includes("id") && h.includes("начислен"));
  p.chargeDate = find((h) => h.includes("дата") && h.includes("начислен"));
  p.serviceGroup = find((h) => h.includes("группа") && h.includes("услуг"));
  p.chargeType = find((h) => h.includes("тип") && h.includes("начислен"));
  p.article = find((h) => h.includes("артикул"));
  p.sku = find((h) => h === "sku" || h.includes("sku"));
  p.productName = find((h) => h.includes("назван") || h.includes("товар"));
  p.quantity = find((h) => h.includes("количество"));
  p.sellerPrice = find((h) => h.includes("цена") && h.includes("продавц"));
  p.orderDate = find(
    (h) => h.includes("дата") && (h.includes("принят") || h.includes("обработк") || h.includes("оказания"))
  );
  p.platform = find((h) => h.includes("платформа"));
  p.workScheme = find((h) => h.includes("схема") && h.includes("работ"));
  p.ozonCommissionPercent = find(
    (h) => h.includes("вознагражден") && (h.includes("%") || h.includes("ozon"))
  );
  p.localizationIndex = find((h) => h.includes("индекс") && h.includes("локализац"));
  p.avgDeliveryHours = find(
    (h) => h.includes("среднее") && (h.includes("время") || h.includes("доставк"))
  );
  p.totalAmount = find(
    (h) => (h.includes("сумма") && h.includes("итого")) || (h.includes("сумма") && h.includes("руб"))
  );

  // Если основные 4 колонки не нашли — падаем на дефолтные позиции.
  if (p.chargeId === -1 || p.chargeType === -1 || p.totalAmount === -1) {
    return { ...FALLBACK_POSITIONS };
  }

  for (const k of Object.keys(p) as Array<keyof ColumnPositions>) {
    if (p[k] === -1) p[k] = FALLBACK_POSITIONS[k];
  }
  return p;
}

function cell(row: any[], idx: number): any {
  return idx >= 0 && idx < row.length ? row[idx] : undefined;
}

/** Декодирует строку через fixEncoding, пропуская артикул/SKU (там цифры/латиница). */
function decodedString(value: any): string {
  if (value == null) return "";
  const str = getString(value);
  if (!str) return "";
  if (/[а-яА-ЯёЁ]/.test(str)) return str;
  const decoded = fixEncoding(str);
  return decoded;
}

function extractPeriodFromA1(label: string): {
  start: Date | null;
  end: Date | null;
  label: string;
} {
  if (!label) return { start: null, end: null, label: "" };
  const decoded = fixEncoding(String(label));
  const match = decoded.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    const [, sd, sm, sy, ed, em, ey] = match;
    const start = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
    const end = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
    return { start, end, label: decoded };
  }
  return { start: null, end: null, label: decoded };
}

/**
 * Нормализует один лист. Возвращает ChargeLine[] и период.
 */
export function normalizeSheet(sheet: RawSheet): NormalizedSheet {
  const period = extractPeriodFromA1(sheet.a1Label);
  const headerIdx = findHeaderRow(sheet.rows);
  const headerRow = sheet.rows[headerIdx] || [];
  const positions = matchColumns(headerRow);
  const dataStart = headerIdx + 1;

  const charges: ChargeLine[] = [];
  for (let i = dataStart; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (!row || row.length === 0) continue;

    const chargeId = getString(cell(row, positions.chargeId));
    const chargeTypeRaw = decodedString(cell(row, positions.chargeType));
    const totalAmount = getNumber(cell(row, positions.totalAmount));

    if (!chargeId && !chargeTypeRaw && totalAmount === 0) continue;

    const orderKey = extractOrderKey(chargeId);
    const shipmentSuffix = extractShipmentSuffix(chargeId);
    const category = classifyChargeType(chargeTypeRaw);

    charges.push({
      sourceFile: sheet.sourceFile,
      sourceRow: i + 1,
      chargeId,
      orderKey,
      shipmentSuffix,
      chargeDate: parseDate(cell(row, positions.chargeDate)),
      serviceGroup: decodedString(cell(row, positions.serviceGroup)),
      chargeType: chargeTypeRaw,
      category,
      article: getString(cell(row, positions.article)),
      sku: getString(cell(row, positions.sku)),
      productName: decodedString(cell(row, positions.productName)),
      quantity: getNumber(cell(row, positions.quantity)),
      sellerPrice: getNumber(cell(row, positions.sellerPrice)),
      orderDate: cell(row, positions.orderDate)
        ? parseDate(cell(row, positions.orderDate))
        : null,
      platform: decodedString(cell(row, positions.platform)),
      workScheme: decodedString(cell(row, positions.workScheme)),
      ozonCommissionPercent: getNumber(cell(row, positions.ozonCommissionPercent)),
      localizationIndex: getNumber(cell(row, positions.localizationIndex)),
      avgDeliveryHours: getNumber(cell(row, positions.avgDeliveryHours)),
      totalAmount,
      isPoints: category === "points",
    });
  }

  return {
    sourceFile: sheet.sourceFile,
    sourceSize: sheet.sourceSize,
    periodStart: period.start,
    periodEnd: period.end,
    periodLabel: period.label,
    charges,
  };
}
