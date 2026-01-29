/**
 * Парсер Excel файлов Ozon отчётов
 */

import * as XLSX from "xlsx";
import * as iconv from "iconv-lite";
import { convertXlsxToXls } from "../converter";
import { logger } from "@/lib/utils/logger";
import { fixEncoding } from "../encoding";
import { extractOrderNumber } from "../constants";
import { getString, getNumber, parseDate } from "../data-utils";
import type { RawRow, ChargeRow } from "../types";

/**
 * Декодирует строку из UTF-16LE (если она была неправильно прочитана)
 * 
 * Проблема: Excel файлы могут содержать строки в UTF-16LE, которые при чтении через XLSX
 * интерпретируются как однобайтовая строка, что даёт результат типа "K@CG:0" вместо "Выручка"
 * 
 * UTF-16LE "Выручка" = байты: 12 04 4B 04 40 04 43 04 47 04 3A 04 30 04
 * При неправильном чтении: \x12K@CG:0 (где \x12 = управляющий символ, 0x04 пропадает)
 */
function decodeUtf16LeString(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  
  // Если строка пустая, возвращаем как есть
  if (!str || str.length === 0) return str;
  
  // Проверяем признаки UTF-16LE:
  // 1. Управляющие символы в начале (0x10-0x1F) + латинские буквы/цифры
  // 2. Паттерн типа "K@CG:0" (управляющий символ + латиница)
  // 3. Символы с кодами 0x04 (часто встречаются в UTF-16LE кириллице)
  
  const hasUtf16LePattern = 
    // Паттерн: управляющий символ + латиница (например, \x12K@CG:0)
    /^[\x10-\x1F][A-Z@0-9:;<=>?]/.test(str) ||
    // Символ 0x04 (часто в UTF-16LE)
    /[\x04]/.test(str) ||
    // Управляющий символ в начале + короткая строка (вероятно UTF-16LE)
    (str.charCodeAt(0) >= 0x10 && str.charCodeAt(0) <= 0x1F && str.length > 1 && str.length < 50);
  
  if (!hasUtf16LePattern) {
    // Не похоже на UTF-16LE, возвращаем как есть
    return str;
  }
  
  // Пытаемся декодировать как UTF-16LE
  // Восстанавливаем оригинальные байты UTF-16LE
  // Пример: "Выручка" в UTF-16LE = 12 04 4B 04 40 04 43 04 47 04 3A 04 30 04
  // При неправильном чтении: \x12K@CG:0 (где \x12 = charCode 18, байт 0x04 пропал)
  
  try {
    const bytes: number[] = [];
    
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      
      // Управляющие символы (0x10-0x1F) - это первый байт UTF-16LE кириллицы
      // Второй байт (0x04) пропал при неправильном чтении
      if (charCode >= 0x10 && charCode <= 0x1F) {
        bytes.push(charCode);  // Первый байт (например, 0x12)
        bytes.push(0x04);       // Второй байт (восстанавливаем пропавший 0x04)
      }
      // Латинские буквы, цифры, знаки (0x20-0x7E) после управляющего символа
      // Это первый байт следующего UTF-16LE символа (второй байт 0x04 пропал)
      else if (charCode >= 0x20 && charCode < 0x7F) {
        bytes.push(charCode);  // Первый байт
        bytes.push(0x04);      // Второй байт (восстанавливаем пропавший 0x04)
      }
      // Остальные символы (уже в правильной кодировке или не UTF-16LE)
      else {
        // Для двухбайтовых символов разбиваем на байты
        if (charCode < 0x100) {
          bytes.push(charCode);
          bytes.push(0x00);
        } else {
          bytes.push(charCode & 0xFF);
          bytes.push((charCode >> 8) & 0xFF);
        }
      }
    }
    
    const buffer = Buffer.from(bytes);
    const decoded = iconv.decode(buffer, 'utf16le');
    
    // Убираем BOM если есть
    const cleaned = decoded.replace(/^\uFEFF/, '').trim();
    
    // Если декодирование дало осмысленный результат (содержит кириллицу), используем его
    if (cleaned !== str && cleaned.length > 0 && /[а-яА-ЯёЁ]/.test(cleaned)) {
      logger.debug("UTF16Decoder", "Декодирована UTF-16LE строка", {
        original: str.substring(0, 30),
        decoded: cleaned.substring(0, 50),
      });
      return cleaned;
    }
  } catch (error) {
    // Если декодирование не удалось, возвращаем оригинал
    logger.debug("UTF16Decoder", "Не удалось декодировать как UTF-16LE", { 
      str: str.substring(0, 30),
      error: error instanceof Error ? error.message : String(error),
    });
  }
  
  return str;
}

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
    // Пробуем разные кодировки: сначала 1251 (Windows-1251), потом 65001 (UTF-8)
    const workbook = XLSX.read(convertedBuffer, {
      type: "array",
      cellDates: true,
      codepage: 1251, // Windows-1251 для кириллицы
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
    
    // Если строка пустая или уже содержит кириллицу, возвращаем как есть
    if (!str || str.length === 0) return str;
    if (/[а-яА-ЯёЁ]/.test(str)) {
      return str; // Уже декодировано
    }
    
    // Пробуем разные методы декодирования
    const candidates: Array<{ decoded: string; method: string }> = [];
    
    // Метод 1: UTF-16LE декодирование
    const utf16Decoded = decodeUtf16LeString(str);
    if (utf16Decoded !== str && /[а-яА-ЯёЁ]/.test(utf16Decoded)) {
      candidates.push({ decoded: utf16Decoded, method: "UTF-16LE" });
    }
    
    // Метод 2: Windows-1251 декодирование (если строка выглядит как Windows-1251)
    const win1251Decoded = this.decodeWindows1251(str);
    if (win1251Decoded !== str && /[а-яА-ЯёЁ]/.test(win1251Decoded)) {
      candidates.push({ decoded: win1251Decoded, method: "Windows-1251" });
    }
    
    // Метод 3: KOI-7 декодирование (для обратной совместимости)
    const koi7Decoded = fixEncoding(str);
    if (koi7Decoded !== str && /[а-яА-ЯёЁ]/.test(koi7Decoded)) {
      candidates.push({ decoded: koi7Decoded, method: "KOI-7" });
    }
    
    // Выбираем лучший результат (с наибольшим количеством кириллицы)
    if (candidates.length > 0) {
      const best = candidates.reduce((best, current) => {
        const bestCyrillicCount = (best.decoded.match(/[а-яА-ЯёЁ]/g) || []).length;
        const currentCyrillicCount = (current.decoded.match(/[а-яА-ЯёЁ]/g) || []).length;
        return currentCyrillicCount > bestCyrillicCount ? current : best;
      });
      
      if (str.length < 100) {
        logger.debug("Decoder", "Декодирование строки", {
          original: str.substring(0, 50),
          decoded: best.decoded.substring(0, 50),
          method: best.method,
        });
      }
      
      return best.decoded;
    }
    
    // Если ничего не помогло, возвращаем оригинал
    return str;
  }
  
  /**
   * Декодирует строку из Windows-1251 (если она была прочитана как однобайтовая)
   * 
   * Проблема: Excel файлы могут содержать строки в Windows-1251, которые при чтении через XLSX
   * интерпретируются как однобайтовая строка, что даёт результат типа "1@01>B:0" вместо "Начисление"
   */
  private decodeWindows1251(value: any): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    
    if (!str || str.length === 0) return str;
    
    // Проверяем признаки Windows-1251:
    // Строка содержит символы в диапазоне 0x20-0xFF, но не содержит кириллицу
    // И содержит паттерны, похожие на кириллицу в Windows-1251
    const hasWin1251Pattern = 
      /[!-~]/.test(str) && // Содержит printable ASCII
      !/[а-яА-ЯёЁ]/.test(str) && // Но не содержит кириллицу
      str.length > 2; // И достаточно длинная
    
    if (!hasWin1251Pattern) {
      return str;
    }
    
    try {
      // Преобразуем строку в Buffer, предполагая что она была прочитана как latin1
      // Затем декодируем как Windows-1251
      const buffer = Buffer.from(str, 'latin1');
      const decoded = iconv.decode(buffer, 'win1251');
      
      // Если декодирование дало осмысленный результат (содержит кириллицу), используем его
      if (decoded !== str && decoded.length > 0 && /[а-яА-ЯёЁ]/.test(decoded)) {
        logger.debug("Win1251Decoder", "Декодирована Windows-1251 строка", {
          original: str.substring(0, 30),
          decoded: decoded.substring(0, 50),
        });
        return decoded;
      }
    } catch (error) {
      // Если декодирование не удалось, возвращаем оригинал
      logger.debug("Win1251Decoder", "Не удалось декодировать как Windows-1251", { 
        str: str.substring(0, 30),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    return str;
  }
}
