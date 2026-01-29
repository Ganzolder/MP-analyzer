/**
 * Парсер Excel файлов Ozon отчётов
 */

import * as XLSX from "xlsx";
import { convertXlsxToXls } from "../converter";
import { logger } from "@/lib/utils/logger";
import { fixEncoding } from "../encoding";
import { extractOrderNumber } from "../constants";
import { getString, getNumber, parseDate } from "../data-utils";
import type { RawRow, ChargeRow } from "../types";

export interface ParseResult {
  chargeRows: ChargeRow[];
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  wasConverted: boolean;
}

/**
 * Позиции колонок в файле Ozon (0-based индексы)
 */
const COLUMN_POSITIONS = {
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

export class FileParser {
  private wasConverted: boolean = false;

  /**
   * Парсит файл отчёта Ozon
   */
  async parseFile(
    file: File | Buffer,
    fileName: string
  ): Promise<ParseResult> {
    const startTime = Date.now();
    let buffer: ArrayBuffer;

    if (file instanceof File) {
      buffer = await file.arrayBuffer();
    } else {
      const arrayBuffer = new ArrayBuffer(file.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < file.length; i++) {
        view[i] = file[i];
      }
      buffer = arrayBuffer;
    }

    // Конвертируем XLSX -> XLS с декодированием KOI-7 (если файл XLSX)
    let convertedBuffer: ArrayBuffer = buffer;
    if (fileName.toLowerCase().endsWith('.xlsx')) {
      try {
        const bufferForConvert = Buffer.from(buffer);
        const convertedXls = await convertXlsxToXls(bufferForConvert);
        const newArrayBuffer = new ArrayBuffer(convertedXls.length);
        const view = new Uint8Array(newArrayBuffer);
        view.set(convertedXls);
        convertedBuffer = newArrayBuffer;
        this.wasConverted = true;
        logger.fileConverted(buffer.byteLength, convertedXls.length);
      } catch (error) {
        logger.warn("Converter", "Конвертация не удалась, используем оригинальный файл", error);
        this.wasConverted = false;
      }
    } else {
      this.wasConverted = false;
      logger.info("Converter", "Файл .xls - пропускаем конвертацию");
    }

    // Читаем файл
    const workbook = XLSX.read(convertedBuffer, {
      type: "array",
      cellDates: true,
      codepage: 1251,
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Извлекаем период из A1
    const period = this.extractPeriod(worksheet);

    // Читаем данные
    const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
    });

    // Определяем строку с заголовками
    const headerRowIndex = this.findHeaderRow(rawData);
    const headerRow = rawData[headerRowIndex] || [];

    // Определяем реальные позиции колонок
    const dynamicColumnPositions = this.findColumnPositions(headerRow);

    // Пропускаем строки до данных
    const dataStartRow = headerRowIndex + 1;
    const rawRows: RawRow[] = [];

    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        const positions = dynamicColumnPositions.totalAmount !== -1
          ? dynamicColumnPositions
          : COLUMN_POSITIONS;

        const rowObj: RawRow = {
          "ID начисления": row[positions.chargeId],
          "Дата начисления": row[positions.chargeDate],
          "Группа услуг": row[positions.serviceGroup],
          "Тип начисления": row[positions.chargeType],
          "Артикул": row[positions.article],
          "SKU": row[positions.sku],
          "Название товара": row[positions.productName],
          "Количество": row[positions.quantity],
          "Цена продавца": row[positions.sellerPrice],
          "Дата принятия заказа в обработку или оказания услуги": row[positions.orderDate],
          "Платформа продажи": row[positions.platform],
          "Схема работы": row[positions.workScheme],
          "Вознаграждение Ozon, %": row[positions.ozonCommissionPercent],
          "Индекс локализации, %": row[positions.localizationIndex],
          "Среднее время доставки, часы": row[positions.avgDeliveryHours],
          "Сумма итого, руб.": row[positions.totalAmount],
        };

        rawRows.push(rowObj);
      }
    }

    logger.fileParsed(rawRows.length, this.wasConverted);

    // Нормализуем и сортируем строки
    const chargeRows = this.normalizeAndSort(rawRows);

    return {
      chargeRows,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      wasConverted: this.wasConverted,
    };
  }

  private extractPeriod(worksheet: XLSX.WorkSheet): {
    start: Date;
    end: Date;
    label: string;
  } {
    const cellA1 = worksheet["A1"];
    let label = "";
    let start = new Date();
    let end = new Date();

    if (cellA1 && cellA1.v) {
      const value = String(cellA1.v);
      label = value;

      const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})-(\d{2})\.(\d{2})\.(\d{4})/);
      if (match) {
        const [, sd, sm, sy, ed, em, ey] = match;
        start = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
        end = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
      }
    }

    return { start, end, label };
  }

  private findHeaderRow(rawData: any[]): number {
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && Array.isArray(row)) {
        const rowStr = row.map(c => String(c || "").toLowerCase()).join(" ");
        if (rowStr.includes("id") && (rowStr.includes("начислен") || rowStr.includes("сумма"))) {
          return i;
        }
      }
    }
    return 1; // По умолчанию
  }

  private findColumnPositions(headerRow: any[]): Record<string, number> {
    const positions: Record<string, number> = {};
    const headerStr = headerRow.map(c => String(c || "").toLowerCase());

    positions.chargeId = headerStr.findIndex(h => h.includes("id") && h.includes("начислен"));
    positions.chargeDate = headerStr.findIndex(h => h.includes("дата") && h.includes("начислен"));
    positions.serviceGroup = headerStr.findIndex(h => h.includes("группа") && h.includes("услуг"));
    positions.chargeType = headerStr.findIndex(h => h.includes("тип") && h.includes("начислен"));
    positions.article = headerStr.findIndex(h => h.includes("артикул"));
    positions.sku = headerStr.findIndex(h => h === "sku" || h.includes("sku"));
    positions.productName = headerStr.findIndex(h => h.includes("назван") || h.includes("товар"));
    positions.quantity = headerStr.findIndex(h => h.includes("количество"));
    positions.sellerPrice = headerStr.findIndex(h => h.includes("цена") && h.includes("продавц"));
    positions.orderDate = headerStr.findIndex(h => h.includes("дата") && (h.includes("принят") || h.includes("обработк")));
    positions.platform = headerStr.findIndex(h => h.includes("платформа"));
    positions.workScheme = headerStr.findIndex(h => h.includes("схема") || h.includes("работ"));
    positions.ozonCommissionPercent = headerStr.findIndex(h => h.includes("вознагражден") && (h.includes("%") || h.includes("ozon")));
    positions.localizationIndex = headerStr.findIndex(h => h.includes("индекс") && h.includes("локализац"));
    positions.avgDeliveryHours = headerStr.findIndex(h => h.includes("среднее") && (h.includes("время") || h.includes("доставк")));
    positions.totalAmount = headerStr.findIndex(h => (h.includes("сумма") && h.includes("итого")) || (h.includes("сумма") && h.includes("руб")));

    return positions;
  }

  private normalizeAndSort(rawRows: RawRow[]): ChargeRow[] {
    const chargeRows = rawRows
      .map((row, index) => this.normalizeRow(row, index))
      .filter((row): row is ChargeRow => row !== null);

    chargeRows.sort((a, b) => {
      if (!a.chargeId && !b.chargeId) return 0;
      if (!a.chargeId) return 1;
      if (!b.chargeId) return -1;
      return a.chargeId.localeCompare(b.chargeId, undefined, { numeric: true });
    });

    return chargeRows;
  }

  private normalizeRow(row: RawRow, index: number): ChargeRow | null {
    const chargeId = getString(row["ID начисления"]);
    const chargeType = this.getDecodedString(row["Тип начисления"], this.wasConverted);
    const totalAmount = getNumber(row["Сумма итого, руб."]);

    if (!chargeId && !chargeType && totalAmount === 0) {
      return null;
    }

    const orderNumber = extractOrderNumber(chargeId);
    const isPoints = false;

    return {
      chargeId,
      orderNumber,
      chargeDate: parseDate(row["Дата начисления"]),
      serviceGroup: this.getDecodedString(row["Группа услуг"], this.wasConverted),
      chargeType,
      article: this.getDecodedString(row["Артикул"], this.wasConverted),
      sku: getString(row["SKU"]),
      productName: this.getDecodedString(row["Название товара"], this.wasConverted),
      quantity: getNumber(row["Количество"]),
      sellerPrice: getNumber(row["Цена продавца"]),
      orderDate: row["Дата принятия заказа в обработку или оказания услуги"]
        ? parseDate(row["Дата принятия заказа в обработку или оказания услуги"])
        : null,
      platform: this.getDecodedString(row["Платформа продажи"], this.wasConverted),
      workScheme: this.getDecodedString(row["Схема работы"], this.wasConverted),
      ozonCommissionPercent: getNumber(row["Вознаграждение Ozon, %"]),
      localizationIndex: getNumber(row["Индекс локализации, %"]),
      avgDeliveryHours: getNumber(row["Среднее время доставки, часы"]),
      totalAmount,
      isPoints,
    };
  }

  private getDecodedString(value: any, wasConverted: boolean): string {
    if (value === null || value === undefined) return "";
    const str = getString(value);
    
    // ВАЖНО: Всегда применяем декодирование, даже если конвертация была
    // потому что на Vercel Python может не работать, и конвертация может не произойти
    // или данные могут быть не полностью декодированы
    const decoded = fixEncoding(str);
    
    // Логируем только если декодирование изменило строку (для отладки)
    if (decoded !== str && str.length > 0 && str.length < 100) {
      logger.debug("Decoder", "Декодирование строки", {
        original: str.substring(0, 50),
        decoded: decoded.substring(0, 50),
        wasConverted,
      });
    }
    
    return decoded;
  }
}
