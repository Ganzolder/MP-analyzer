/**
 * Парсер файла для калькулятора Озона
 */

import * as XLSX from "xlsx";
import type { OzonProductData, ParsedFileResult } from "@/lib/types/calculator";

/**
 * Ожидаемые колонки в файле
 */
const REQUIRED_COLUMNS = {
  category: ["категория товара", "категория", "category"],
  article: ["артикул", "article", "артикул товара", "sku"],
  name: ["наименование", "name", "название", "название товара"],
  cost: ["себестоимость", "cost", "себестоимость руб", "себестоимость, руб", "закуп", "закупочная цена", "закупка"],
  marginPercent: ["маржинальность в %", "маржинальность", "margin", "margin %", "маржинальность, %", "маржа", "маржа %", "маржа, %"],
  width: ["ширина в мм", "ширина", "width", "ширина, мм", "ширина мм"],
  height: ["высота в мм", "высота", "height", "высота, мм", "высота мм"],
  length: ["длина в мм", "длина", "length", "длина, мм", "длина мм"],
  weight: ["вес в граммах", "вес", "weight", "вес, г", "вес, грамм"],
  volume: ["объём", "объем", "volume", "объём, л", "объем, л", "объём л", "объем л"],
};

/**
 * Нормализует название колонки (приводит к нижнему регистру, убирает пробелы)
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Находит индекс колонки по возможным названиям
 */
function findColumnIndex(
  headers: string[],
  possibleNames: string[]
): number {
  const normalizedHeaders = headers.map(normalizeColumnName);
  const normalizedPossible = possibleNames.map(normalizeColumnName);

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const header = normalizedHeaders[i];
    for (const possible of normalizedPossible) {
      if (header === possible || header.includes(possible) || possible.includes(header)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Парсит число из ячейки
 */
function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }
  
  if (typeof value === "string") {
    // Убираем пробелы и заменяем запятую на точку
    const cleaned = value.trim().replace(/,/g, ".").replace(/\s/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  
  return null;
}

/**
 * Парсит строку из ячейки
 */
function parseString(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/**
 * Извлекает текстовое значение ячейки из worksheet, сохраняя исходный формат.
 * Это критично для артикулов: Excel может хранить "00123" как число 123,
 * а большие числа теряют точность при конвертации Number → String.
 * Используем свойство `w` (formatted text) ячейки, если доступно.
 */
function getRawCellText(worksheet: XLSX.WorkSheet, row: number, col: number): string {
  const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = worksheet[cellAddress];
  if (!cell) return "";
  // Если есть отформатированный текст (w) — используем его
  if (cell.w !== undefined && cell.w !== null) {
    return String(cell.w).trim();
  }
  // Если значение — строка, возвращаем как есть
  if (cell.t === "s" && cell.v !== undefined) {
    return String(cell.v).trim();
  }
  // Для чисел — возвращаем точное представление
  if (cell.v !== undefined && cell.v !== null) {
    return String(cell.v).trim();
  }
  return "";
}

/** Максимальное количество строк для массового расчёта */
const MAX_ROWS_LIMIT = 10000;

/**
 * Парсит файл Excel для калькулятора Озона
 * Поддерживает как габариты (ширина/высота/длина в мм), так и прямой объём (л)
 */
export async function parseOzonFile(file: File): Promise<ParsedFileResult> {
  const products: OzonProductData[] = [];
  const errors: string[] = [];
  const categoriesSet = new Set<string>();

  try {
    // Читаем файл
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Берём первый лист
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Конвертируем в массив массивов
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

    if (data.length < 2) {
      return {
        products: [],
        categories: [],
        errors: ["Файл пуст или содержит только заголовки"],
      };
    }

    // Проверяем лимит строк (без учёта заголовка)
    const dataRowsCount = data.length - 1;
    if (dataRowsCount > MAX_ROWS_LIMIT) {
      return {
        products: [],
        categories: [],
        errors: [`Файл содержит ${dataRowsCount} строк данных. Максимально допустимое количество: ${MAX_ROWS_LIMIT.toLocaleString("ru-RU")}. Пожалуйста, разбейте файл на части.`],
      };
    }

    // Первая строка - заголовки
    const headers = data[0].map((h: any) => parseString(h));

    // Находим индексы колонок
    const categoryIdx = findColumnIndex(headers, REQUIRED_COLUMNS.category);
    const articleIdx = findColumnIndex(headers, REQUIRED_COLUMNS.article);
    const nameIdx = findColumnIndex(headers, REQUIRED_COLUMNS.name);
    const costIdx = findColumnIndex(headers, REQUIRED_COLUMNS.cost);
    const marginIdx = findColumnIndex(headers, REQUIRED_COLUMNS.marginPercent);
    const widthIdx = findColumnIndex(headers, REQUIRED_COLUMNS.width);
    const heightIdx = findColumnIndex(headers, REQUIRED_COLUMNS.height);
    const lengthIdx = findColumnIndex(headers, REQUIRED_COLUMNS.length);
    const weightIdx = findColumnIndex(headers, REQUIRED_COLUMNS.weight);
    const volumeIdx = findColumnIndex(headers, REQUIRED_COLUMNS.volume);

    // Определяем, есть ли габариты или объём
    const hasDimensions = widthIdx !== -1 && heightIdx !== -1 && lengthIdx !== -1;
    const hasVolume = volumeIdx !== -1;

    // Проверяем обязательные колонки
    const missingColumns: string[] = [];
    if (categoryIdx === -1) missingColumns.push("Категория товара");
    if (articleIdx === -1) missingColumns.push("Артикул");
    if (nameIdx === -1) missingColumns.push("Наименование");
    if (costIdx === -1) missingColumns.push("Себестоимость / Закуп");

    // Нужны либо габариты, либо объём
    if (!hasDimensions && !hasVolume) {
      missingColumns.push("Габариты (Ширина/Высота/Длина) или Объём");
    }

    if (missingColumns.length > 0) {
      return {
        products: [],
        categories: [],
        errors: [`Отсутствуют обязательные колонки: ${missingColumns.join(", ")}`],
      };
    }

    // Парсим строки данных
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1;

      // Пропускаем пустые строки
      if (!row || row.every((cell: any) => cell === null || cell === undefined || cell === "")) {
        continue;
      }

      const category = parseString(row[categoryIdx]);
      // Для артикула используем getRawCellText, чтобы сохранить исходный формат
      // (ведущие нули, большие числа без потери точности)
      const article = getRawCellText(worksheet, i, articleIdx);
      const name = parseString(row[nameIdx]);
      const cost = parseNumber(row[costIdx]);
      const marginPercent = marginIdx !== -1 ? parseNumber(row[marginIdx]) : null;
      const width = widthIdx !== -1 ? parseNumber(row[widthIdx]) : null;
      const height = heightIdx !== -1 ? parseNumber(row[heightIdx]) : null;
      const length = lengthIdx !== -1 ? parseNumber(row[lengthIdx]) : null;
      const weight = weightIdx !== -1 ? parseNumber(row[weightIdx]) : null;
      const directVolume = volumeIdx !== -1 ? parseNumber(row[volumeIdx]) : null;

      // Валидация обязательных полей
      const rowErrors: string[] = [];

      if (!category) {
        rowErrors.push(`Строка ${rowNum}: отсутствует категория товара`);
      }
      if (!article) {
        rowErrors.push(`Строка ${rowNum}: отсутствует артикул`);
      }
      if (!name) {
        rowErrors.push(`Строка ${rowNum}: отсутствует наименование`);
      }
      if (cost === null || cost === undefined) {
        rowErrors.push(`Строка ${rowNum}: отсутствует или неверная себестоимость`);
      }

      // Проверяем, можем ли рассчитать объём
      let volumeLiters: number | null = null;

      if (directVolume !== null && directVolume > 0) {
        // Прямой объём имеет приоритет
        volumeLiters = directVolume;
      } else if (width !== null && height !== null && length !== null && width > 0 && height > 0 && length > 0) {
        // Рассчитываем из габаритов (мм → литры)
        // volume_mm3 = width * height * length
        // volume_liters = volume_mm3 / 1_000_000
        volumeLiters = (width * height * length) / 1_000_000;
      }

      if (volumeLiters === null || volumeLiters <= 0) {
        rowErrors.push(`Строка ${rowNum}: не удалось определить объём (укажите габариты или объём напрямую)`);
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      // Добавляем категорию в список
      if (category) {
        categoriesSet.add(category);
      }

      // Создаём объект товара
      const product: OzonProductData = {
        category,
        article,
        name,
        cost: cost!,
        marginPercent: marginPercent !== null ? marginPercent : undefined,
        width: width ?? 0,
        height: height ?? 0,
        length: length ?? 0,
        weight: weight !== null ? weight : undefined,
        volumeLiters: volumeLiters!,
      };

      products.push(product);
    }

    return {
      products,
      categories: Array.from(categoriesSet).sort(),
      errors,
    };
  } catch (error: any) {
    return {
      products: [],
      categories: [],
      errors: [`Ошибка при парсинге файла: ${error.message || "Неизвестная ошибка"}`],
    };
  }
}
