/**
 * Парсер файла себестоимости
 * 
 * Формат файла: XLSX
 * Структура:
 * - Первая строка: заголовки (опционально)
 * - Колонка 1: Артикул (текст)
 * - Колонка 2: Себестоимость за единицу (число, руб.)
 */

import * as XLSX from "xlsx";
import { logger } from "@/lib/utils/logger";

export interface CostData {
  article: string;
  costPerUnit: number;
}

/**
 * Парсит файл себестоимости и возвращает Map<артикул, стоимость>
 */
export async function parseCostFile(file: File | Buffer): Promise<Map<string, number>> {
  const startTime = Date.now();
  
  try {
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
    
    // Читаем Excel файл
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Читаем данные как массив массивов (по строкам)
    // Используем raw: true для чисел, чтобы сохранить точность, но потом преобразуем строки
    const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1, // Массив массивов
      raw: true, // Сохраняем типы (числа остаются числами)
      defval: "", // Значение по умолчанию для пустых ячеек
    });
    
    console.log("📋 [CostParser] Данные из Excel:");
    console.log(`   Всего строк в файле: ${rawData.length}`);
    if (rawData.length > 0) {
      console.log("   Первые 5 строк (примеры):");
      rawData.slice(0, 5).forEach((row, idx) => {
        console.log(`      Строка ${idx + 1}:`, JSON.stringify(row));
      });
    }
    
    const costMap = new Map<string, number>();
    
    // Определяем структуру файла
    let startRow = 0;
    let articleColumnIndex = 0; // По умолчанию первая колонка
    let costColumnIndex = 1; // По умолчанию вторая колонка
    
    // Ищем заголовки для определения структуры
    if (rawData.length > 0) {
      // Проверяем первую строку на наличие заголовка "Артикул"
      const firstRow = rawData[0];
      for (let colIdx = 0; colIdx < firstRow.length; colIdx++) {
        const header = String(firstRow[colIdx] || "").toLowerCase();
        if (header.includes("артикул")) {
          articleColumnIndex = colIdx;
          console.log(`   ✅ Колонка артикула найдена: индекс ${articleColumnIndex} ("${firstRow[colIdx]}")`);
          startRow = 1; // Пропускаем первую строку заголовка
          break;
        }
      }
      
      // Ищем колонку с себестоимостью/закупочной ценой
      if (startRow > 0) {
        for (let colIdx = 0; colIdx < firstRow.length; colIdx++) {
          const header = String(firstRow[colIdx] || "").toLowerCase();
          if (header.includes("закупочная") || header.includes("себестоимость") || 
              header.includes("стоимость") || (header.includes("сумма") && !header.includes("изменение"))) {
            costColumnIndex = colIdx;
            console.log(`   ✅ Колонка себестоимости найдена: индекс ${costColumnIndex} ("${firstRow[colIdx]}")`);
            break;
          }
        }
        
        // Если есть вторая строка заголовков, проверяем её тоже
        if (rawData.length > 1) {
          const secondRow = rawData[1];
          // Если во второй строке есть заголовки (не пустая), пропускаем и её
          const hasHeadersInSecondRow = secondRow && Array.isArray(secondRow) && 
            secondRow.some((cell: any) => {
              const str = String(cell || "").toLowerCase();
              return str.includes("цена") || str.includes("стоимость") || str.includes("закупочная");
            });
          
          if (hasHeadersInSecondRow) {
            startRow = 2; // Пропускаем обе строки заголовков
            console.log("   ✅ Обнаружена вторая строка заголовков, пропускаем обе");
          }
        }
        
        // Если не нашли "закупочная" в первой строке, проверяем вторую
        if (costColumnIndex === 1 && rawData.length > 1) {
          const secondRow = rawData[1];
          for (let colIdx = 0; colIdx < secondRow.length; colIdx++) {
            const header = String(secondRow[colIdx] || "").toLowerCase();
            if (header.includes("закупочная") || (header.includes("цена") && !header.includes("старая") && !header.includes("новая"))) {
              costColumnIndex = colIdx;
              console.log(`   ✅ Колонка себестоимости найдена во второй строке: индекс ${costColumnIndex} ("${secondRow[colIdx]}")`);
              break;
            }
          }
        }
      }
    }
    
    let processedRows = 0;
    let skippedEmpty = 0;
    let skippedInvalid = 0;
    let skippedNaN = 0;
    
    // Парсим данные
    console.log(`   🔍 Начинаем парсинг данных со строки ${startRow}`);
    console.log(`   📍 Артикул: колонка ${articleColumnIndex}, Себестоимость: колонка ${costColumnIndex}`);
    
    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !Array.isArray(row)) {
        skippedEmpty++;
        continue;
      }
      
      // Нужна хотя бы колонка с артикулом, и колонка с себестоимостью
      if (row.length <= Math.max(articleColumnIndex, costColumnIndex)) {
        skippedEmpty++;
        continue;
      }
      
      const article = String(row[articleColumnIndex] || "").trim();
      const costValue = row[costColumnIndex]; // Используем определенный индекс колонки
      
      // Детальное логирование первых 10 строк для отладки
      if (processedRows + skippedEmpty + skippedInvalid + skippedNaN < 10) {
        console.log(`   🔍 Строка ${i + 1}:`);
        console.log(`      Артикул (колонка ${articleColumnIndex}): "${article}"`);
        console.log(`      Себестоимость (колонка ${costColumnIndex}): ${JSON.stringify(costValue)} (тип: ${typeof costValue})`);
        console.log(`      Все колонки строки: ${JSON.stringify(row.slice(0, Math.min(10, row.length)))}`);
      }
      
      if (!article || article === "") {
        skippedEmpty++;
        continue; // Пропускаем пустые артикулы
      }
      
      // Преобразуем стоимость в число
      let cost: number;
      if (typeof costValue === "number") {
        cost = costValue;
      } else if (typeof costValue === "string") {
        // Убираем пробелы и заменяем запятую на точку
        const cleaned = costValue.trim().replace(/,/g, ".").replace(/\s/g, "");
        cost = parseFloat(cleaned);
        
        // Логируем преобразование для первых строк
        if (processedRows < 5) {
          console.log(`      Преобразование: "${costValue}" → "${cleaned}" → ${cost}`);
        }
      } else {
        skippedInvalid++;
        if (processedRows + skippedEmpty + skippedInvalid + skippedNaN < 10) {
          console.log(`      ⚠️ Пропущено: невалидный тип значения себестоимости`);
        }
        continue; // Пропускаем если не число и не строка
      }
      
      if (isNaN(cost) || cost < 0) {
        skippedNaN++;
        if (processedRows + skippedEmpty + skippedInvalid + skippedNaN < 10) {
          console.log(`      ⚠️ Пропущено: NaN или отрицательное значение (${cost})`);
        }
        continue; // Пропускаем некорректные значения
      }
      
      // Если артикул уже есть, берем максимальное значение
      if (costMap.has(article)) {
        const existingCost = costMap.get(article)!;
        if (cost > existingCost) {
          costMap.set(article, cost);
          if (processedRows < 5) {
            console.log(`      ✅ Обновлена себестоимость для "${article}": ${existingCost} → ${cost}`);
          }
        }
      } else {
        costMap.set(article, cost);
        if (processedRows < 5) {
          console.log(`      ✅ Добавлен артикул "${article}" = ${cost} ₽`);
        }
      }
      processedRows++;
    }
    
    console.log("📊 [CostParser] Статистика парсинга:");
    console.log(`   Обработано строк: ${processedRows}`);
    console.log(`   Пропущено пустых: ${skippedEmpty}`);
    console.log(`   Пропущено невалидных: ${skippedInvalid}`);
    console.log(`   Пропущено NaN/отрицательных: ${skippedNaN}`);
    console.log(`   Уникальных артикулов: ${costMap.size}`);
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Логирование примеров артикулов
    console.log("=".repeat(60));
    console.log("📊 [CostParser] Файл себестоимости распарсен");
    console.log(`   Всего записей: ${costMap.size}`);
    console.log(`   Время обработки: ${duration.toFixed(2)} сек`);
    
    if (costMap.size > 0) {
      const articles = Array.from(costMap.keys());
      console.log("   Примеры артикулов с себестоимостью (первые 20):");
      articles.slice(0, 20).forEach((article, idx) => {
        const cost = costMap.get(article);
        console.log(`      ${idx + 1}. "${article}" = ${cost} ₽`);
      });
      
      // Статистика по себестоимости
      const costs = Array.from(costMap.values());
      const minCost = Math.min(...costs);
      const maxCost = Math.max(...costs);
      const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
      console.log(`   Статистика себестоимости: мин=${minCost} ₽, макс=${maxCost} ₽, средняя=${avgCost.toFixed(2)} ₽`);
      
      // Проверка на кириллицу и латиницу
      const hasCyrillic = articles.some(a => /[а-яё]/i.test(a));
      const hasLatin = articles.some(a => /[a-z]/i.test(a));
      console.log(`   Артикулы содержат кириллицу: ${hasCyrillic ? "ДА" : "НЕТ"}`);
      console.log(`   Артикулы содержат латиницу: ${hasLatin ? "ДА" : "НЕТ"}`);
      
      // Статистика по длине
      const lengths = articles.map(a => a.length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const minLength = Math.min(...lengths);
      const maxLength = Math.max(...lengths);
      console.log(`   Длина артикулов: мин=${minLength}, макс=${maxLength}, средняя=${avgLength.toFixed(1)}`);
    }
    console.log("=".repeat(60));
    
    logger.info("CostParser", `Файл себестоимости распарсен: ${costMap.size} записей`, {
      entries: costMap.size,
      duration: `${duration.toFixed(2)} сек`,
    });
    
    return costMap;
  } catch (error: any) {
    logger.error("CostParser", "Ошибка при парсинге файла себестоимости", error);
    throw new Error(`Ошибка парсинга файла себестоимости: ${error.message}`);
  }
}
