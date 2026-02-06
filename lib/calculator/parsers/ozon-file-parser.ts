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
  article: ["артикул", "article", "артикул товара"],
  name: ["наименование", "name", "название", "название товара"],
  cost: ["себестоимость", "cost", "себестоимость руб", "себестоимость, руб"],
  marginPercent: ["маржинальность в %", "маржинальность", "margin", "margin %", "маржинальность, %"],
  width: ["ширина в мм", "ширина", "width", "ширина, мм"],
  height: ["высота в мм", "высота", "height", "высота, мм"],
  length: ["длина в мм", "длина", "length", "длина, мм"],
  weight: ["вес в граммах", "вес", "weight", "вес, г", "вес, грамм"],
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
 * Парсит файл Excel для калькулятора Озона
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

    // Проверяем обязательные колонки
    const missingColumns: string[] = [];
    if (categoryIdx === -1) missingColumns.push("Категория товара");
    if (articleIdx === -1) missingColumns.push("Артикул");
    if (nameIdx === -1) missingColumns.push("Наименование");
    if (costIdx === -1) missingColumns.push("Себестоимость");
    if (widthIdx === -1) missingColumns.push("Ширина в мм");
    if (heightIdx === -1) missingColumns.push("Высота в мм");
    if (lengthIdx === -1) missingColumns.push("Длина в мм");

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
      const article = parseString(row[articleIdx]);
      const name = parseString(row[nameIdx]);
      const cost = parseNumber(row[costIdx]);
      const marginPercent = marginIdx !== -1 ? parseNumber(row[marginIdx]) : null;
      const width = parseNumber(row[widthIdx]);
      const height = parseNumber(row[heightIdx]);
      const length = parseNumber(row[lengthIdx]);
      const weight = weightIdx !== -1 ? parseNumber(row[weightIdx]) : null;

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
      if (width === null || width === undefined || width <= 0) {
        rowErrors.push(`Строка ${rowNum}: отсутствует или неверная ширина`);
      }
      if (height === null || height === undefined || height <= 0) {
        rowErrors.push(`Строка ${rowNum}: отсутствует или неверная высота`);
      }
      if (length === null || length === undefined || length <= 0) {
        rowErrors.push(`Строка ${rowNum}: отсутствует или неверная длина`);
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
        width: width!,
        height: height!,
        length: length!,
        weight: weight !== null ? weight : undefined,
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
