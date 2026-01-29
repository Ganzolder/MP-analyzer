/**
 * Модуль анализа финансовых отчётов Ozon
 * 
 * Логика обработки:
 * 1. Сортировка по ID начисления (по возрастанию)
 * 2. Извлечение номера заказа из ID начисления (убираем всё после второго дефиса)
 * 3. Группировка строк по номеру заказа
 * 4. Суммирование "Сумма итого, руб." по заказу
 * 5. Заполнение пустых полей из других строк заказа
 * 6. Определение возвратов по типу начисления
 * 7. Обработка начислений без заказа (группировка по типу)
 * 8. Отдельный учёт баллов за скидки
 * 9. Выделение подписок и общих затрат магазина
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { getChargeGroup } from "./charge-type-groups";
import { convertXlsxToXls } from "./converter";
import { logger } from "@/lib/utils/logger";
import { fixEncoding } from "./encoding";
import { getChargeCategory, SUBSCRIPTION_PATTERN, ORDER_NUMBER_PATTERN, extractOrderNumber } from "./constants";
import { getString, getNumber, parseDate, formatDate, round, generateId } from "./data-utils";
import type {
  RawRow,
  ChargeRow,
  OrderStatus,
  AggregatedOrder,
  NonOrderCharge,
  SubscriptionCharge,
  ProductMetrics,
  DailyMetrics,
  CostBreakdown,
  ProblemArea,
  Recommendation,
  AnalysisResult,
} from "./types";

// Реэкспортируем типы для обратной совместимости
export type {
  RawRow,
  ChargeRow,
  OrderStatus,
  AggregatedOrder,
  NonOrderCharge,
  SubscriptionCharge,
  ProductMetrics,
  DailyMetrics,
  CostBreakdown,
  ProblemArea,
  Recommendation,
  AnalysisResult,
} from "./types";

// =============================================================================
// ТИПЫ И КОНСТАНТЫ (перенесены в отдельные модули)
// =============================================================================

// =============================================================================
// ОСНОВНОЙ КЛАСС АНАЛИЗАТОРА
// =============================================================================

export class OzonReportAnalyzer {
  private rawRows: RawRow[] = [];
  private chargeRows: ChargeRow[] = [];
  private fileName: string = "";
  private periodLabel: string = "";
  private periodStart: Date = new Date();
  private periodEnd: Date = new Date();
  private wasConverted: boolean = false; // Флаг: был ли файл конвертирован через Python
  private costData: Map<string, number> | undefined; // Данные себестоимости (артикул -> стоимость)
  private articlesComparison: { costArticles: string[]; orderArticles: string[] } | undefined; // Для визуального сравнения
  
  /**
   * Анализирует файл отчёта
   */
  async analyze(file: File | Buffer, fileName: string, costData?: Map<string, number>): Promise<AnalysisResult> {
    this.costData = costData;
    const startTime = Date.now();
    this.fileName = fileName;
    
    const fileSize = file instanceof Buffer ? file.length : (await (file as File).arrayBuffer()).byteLength;
    console.log("📊 [Analyzer] Начало анализа:", fileName, `(${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    logger.startAnalysis(fileName, fileSize);
    
    // 1. Парсинг файла
    await this.parseFile(file);
    console.log("📄 [Analyzer] Файл распарсен. Строк:", this.rawRows.length);
    
    // 2. Нормализация и сортировка
    this.normalizeAndSort();
    console.log("🔧 [Analyzer] Данные нормализованы. Строк после нормализации:", this.chargeRows.length);
    
    // 3. Агрегация заказов
    const orders = this.aggregateOrders();
    console.log("📦 [Analyzer] Заказы агрегированы. Всего заказов:", orders.length);
    
    // 3.1. Добавляем себестоимость к заказам
    this.addCostToOrders(orders);
    
    // 4. Обработка начислений без заказов
    const nonOrderCharges = this.aggregateNonOrderCharges();
    
    // 5. Выделение подписок
    const subscriptions = this.extractSubscriptions();
    
    // 6. Расчёт метрик по товарам
    const productMetrics = this.calculateProductMetrics(orders, this.costData);
    console.log("📈 [Analyzer] Метрики товаров рассчитаны. Всего товаров:", productMetrics.length);
    const withNames = productMetrics.filter(p => p.productName && p.productName.trim()).length;
    console.log("   Товаров с названиями:", withNames, `(${withNames > 0 ? ((withNames / productMetrics.length) * 100).toFixed(1) : 0}%)`);
    
    // 7. Расчёт сводки и затрат
    const summary = this.calculateSummary(orders, nonOrderCharges, subscriptions, productMetrics);
    const costBreakdown = this.calculateCostBreakdown(orders, nonOrderCharges, subscriptions);
    
    // 8. Метрики по дням
    const dailyMetrics = this.calculateDailyMetrics(orders);
    
    // 9. Топы и проблемные товары
    // Не ограничиваем количество - пагинация будет в UI
    // Включаем все товары (включая убыточные) - сортировка по прибыли
    const topProducts = [...productMetrics]
      .sort((a, b) => {
        // Сортируем: сначала по чистой прибыли (если есть), потом по прибыли
        const aValue = (a.netProfit !== undefined ? a.netProfit : a.netAmount) || 0;
        const bValue = (b.netProfit !== undefined ? b.netProfit : b.netAmount) || 0;
        return bValue - aValue;
      });
    const worstProducts = this.getWorstProducts(productMetrics, Number.MAX_SAFE_INTEGER);
    const topOrders = this.getTopOrders(orders, 10);
    const returnedOrders = orders.filter(o => o.status === "returned" || o.status === "partial_return");
    
    console.log("🏆 [Analyzer] Топ-10 товаров:", topProducts.length);
    if (topProducts.length > 0) {
      console.log("   Первый товар:", topProducts[0].productName || "[БЕЗ НАЗВАНИЯ]", "SKU:", topProducts[0].sku);
    }
    
    // 10. Проблемные зоны и рекомендации
    const problemAreas = this.identifyProblemAreas(orders, productMetrics, costBreakdown);
    const recommendations = this.generateRecommendations(summary, costBreakdown, problemAreas);
    
    // 11. Статистика по схемам
    const schemeStats = this.calculateSchemeStats(orders);
    
    // 12. Детализация по типам начислений (группировка)
    const chargeTypeBreakdown = this.calculateChargeTypeBreakdown();
    
    // 13. Отчёты по себестоимости
    const costReports = this.generateCostReports(orders, productMetrics);
    
    // Проверяем, что articlesComparison сохранился
    if (costReports && costReports.articlesComparison) {
      console.log("✅ [Analyzer] articlesComparison сохранён в costReports:");
      console.log(`   Артикулов из себестоимости: ${costReports.articlesComparison.costArticles.length}`);
      console.log(`   Артикулов из заказов: ${costReports.articlesComparison.orderArticles.length}`);
    } else {
      console.log("⚠️ [Analyzer] articlesComparison НЕ найден в costReports");
      console.log("   costReports:", costReports ? "существует" : "undefined");
    }
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log("✅ [Analyzer] Анализ завершён за", duration.toFixed(2), "сек");
    console.log("   Выручка:", summary.grossRevenue.toLocaleString("ru-RU"), "₽");
    console.log("   К выплате:", summary.netPayout.toLocaleString("ru-RU"), "₽");
    console.log("   Заказов:", summary.totalOrders);
    
    logger.summaryCalculated({
      grossRevenue: summary.grossRevenue,
      netPayout: summary.netPayout,
      totalOrders: summary.totalOrders,
    });
    
    logger.analysisComplete(duration);
    
    return {
      id: generateId(),
      fileName: this.fileName,
      analyzedAt: new Date(),
      period: {
        start: this.periodStart,
        end: this.periodEnd,
        label: this.periodLabel,
      },
      summary,
      costBreakdown,
      dailyMetrics,
      orders,
      topOrders,
      returnedOrders,
      nonOrderCharges,
      subscriptions,
      productMetrics,
      topProducts,
      worstProducts,
      problemAreas,
      recommendations,
      schemeStats,
      chargeTypeBreakdown,
      costReports,
    };
  }
  
  // ===========================================================================
  // ОТЧЁТЫ ПО СЕБЕСТОИМОСТИ
  // ===========================================================================
  
  private generateCostReports(
    orders: AggregatedOrder[],
    productMetrics: ProductMetrics[]
  ): AnalysisResult["costReports"] {
    const productsWithCost: ProductMetrics[] = [];
    const productsWithoutCost: ProductMetrics[] = [];
    const ordersWithCost: AggregatedOrder[] = [];
    const ordersWithoutCost: AggregatedOrder[] = [];
    
    let totalCost = 0;
    let totalCostSold = 0;
    let totalNetProfit = 0;
    
    // Разделяем товары на с себестоимостью и без
    // ВАЖНО: 
    // - В список "с себестоимостью" попадают все товары с hasCost === true (независимо от выручки)
    // - В расчёты прибыли (totalCostSold, totalNetProfit) учитывается себестоимость только для товаров с выручкой > 0
    for (const product of productMetrics) {
      // Товар считается "с себестоимостью", если есть costPerUnit из файла себестоимости
      if (product.hasCost && product.costPerUnit !== undefined) {
        productsWithCost.push(product);
        
        // В расчёты прибыли включаем себестоимость только для товаров с выручкой
        if (product.totalRevenue > 0 && product.totalCost !== undefined) {
          totalCostSold += product.totalCost;
        }
        if (product.totalRevenue > 0 && product.netProfit !== undefined) {
          totalNetProfit += product.netProfit;
        }
      } else {
        productsWithoutCost.push(product);
      }
    }
    
    // Разделяем заказы на с себестоимостью и без
    // ВАЖНО: себестоимость учитывается только для заказов с выручкой > 0 (возвраты исключаются)
    for (const order of orders) {
      // Проверяем, что заказ имеет выручку (не возвращенный)
      const hasRevenue = order.grossRevenue > 0;
      
      if (order.hasCost && order.totalCost !== undefined && hasRevenue) {
        ordersWithCost.push(order);
        totalCost += order.totalCost;
        
        // Для totalCostSold учитываем только завершённые заказы с выручкой
        if (order.status === "completed") {
          totalCostSold += order.totalCost;
        }
      } else {
        ordersWithoutCost.push(order);
      }
    }
    
    return {
      productsWithCost,
      productsWithoutCost,
      ordersWithCost,
      ordersWithoutCost,
      totalCost: round(totalCost),
      totalCostSold: round(totalCostSold),
      totalNetProfit: round(totalNetProfit),
      articlesComparison: this.articlesComparison, // Добавляем списки артикулов для сравнения
    };
  }
  
  // ===========================================================================
  // ПАРСИНГ ФАЙЛА
  // ===========================================================================
  
  /**
   * Позиции колонок в файле Ozon (0-based индексы)
   * A=0, B=1, C=2 и т.д.
   */
  private static readonly COLUMN_POSITIONS = {
    chargeId: 0,              // A: ID начисления
    chargeDate: 1,            // B: Дата начисления
    serviceGroup: 2,          // C: Группа услуг
    chargeType: 3,            // D: Тип начисления
    article: 4,               // E: Артикул
    sku: 5,                   // F: SKU
    productName: 6,           // G: Название товара
    quantity: 7,              // H: Количество
    sellerPrice: 8,           // I: Цена продавца
    orderDate: 9,             // J: Дата принятия заказа
    platform: 10,             // K: Платформа продажи
    workScheme: 11,           // L: Схема работы
    ozonCommissionPercent: 12,// M: Вознаграждение Ozon, %
    localizationIndex: 13,    // N: Индекс локализации, %
    avgDeliveryHours: 14,     // O: Среднее время доставки
    totalAmount: 15,          // P: Сумма итого, руб.
  };
  
  private async parseFile(file: File | Buffer): Promise<void> {
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
    if (this.fileName.toLowerCase().endsWith('.xlsx')) {
      try {
        const bufferForConvert = Buffer.from(buffer);
        const convertedXls = await convertXlsxToXls(bufferForConvert);
        // Создаем новый ArrayBuffer из Buffer
        const newArrayBuffer = new ArrayBuffer(convertedXls.length);
        const view = new Uint8Array(newArrayBuffer);
        view.set(convertedXls);
        convertedBuffer = newArrayBuffer;
        this.wasConverted = true; // Помечаем, что файл был конвертирован (данные уже декодированы)
        logger.fileConverted(buffer.byteLength, convertedXls.length);
      } catch (error) {
        logger.warn("Converter", "Конвертация не удалась, используем оригинальный файл", error);
        this.wasConverted = false; // Файл не был конвертирован, нужно декодировать вручную
        // Используем оригинальный файл, если конвертация не удалась
      }
    } else {
      this.wasConverted = false; // .xls файл - не конвертировали, нужно декодировать
      logger.info("Converter", "Файл .xls - пропускаем конвертацию");
    }
    
    // Читаем файл
    const workbook = XLSX.read(convertedBuffer, { 
      type: "array", 
      cellDates: true,
      codepage: 1251, // Windows-1251 для кириллицы
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Извлекаем период из A1
    this.extractPeriod(worksheet);
    
    // Читаем данные как массив массивов (по позициям колонок)
    const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,        // Возвращает массив массивов
      raw: true,        // ВАЖНО: возвращает сырые числа, а не форматированные строки
      defval: "",
    });
    
    // Диагностика: выводим первые строки для проверки структуры
    console.log("🔍 [Parser] Диагностика файла:");
    console.log(`   Всего строк в файле: ${rawData.length}`);
    console.log(`   Первые 5 строк (сырые данные):`);
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && Array.isArray(row)) {
        console.log(`      Строка ${i}: длина=${row.length}, первые 5 значений=${JSON.stringify(row.slice(0, 5))}`);
      }
    }
    
    // Определяем строку с заголовками (ищем строку, содержащую "ID начисления" или похожие)
    let headerRowIndex = 1; // По умолчанию вторая строка (индекс 1)
    let headerRow: any[] = [];
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const row = rawData[i];
      if (row && Array.isArray(row)) {
        const rowStr = row.map(c => String(c || "").toLowerCase()).join(" ");
        // Ищем маркеры заголовков
        if (rowStr.includes("id") && (rowStr.includes("начислен") || rowStr.includes("сумма"))) {
          headerRowIndex = i;
          headerRow = row;
          console.log(`   ✅ Найдена строка заголовков: индекс ${i}, колонок: ${row.length}`);
          break;
        }
      }
    }
    
    // Определяем реальные позиции колонок из заголовков
    const dynamicColumnPositions: Record<string, number> = {};
    const headerStr = headerRow.map(c => String(c || "").toLowerCase());
    
    // Ищем каждую колонку по заголовку
    dynamicColumnPositions.chargeId = headerStr.findIndex(h => h.includes("id") && h.includes("начислен"));
    dynamicColumnPositions.chargeDate = headerStr.findIndex(h => h.includes("дата") && h.includes("начислен"));
    dynamicColumnPositions.serviceGroup = headerStr.findIndex(h => h.includes("группа") && h.includes("услуг"));
    dynamicColumnPositions.chargeType = headerStr.findIndex(h => h.includes("тип") && h.includes("начислен"));
    dynamicColumnPositions.article = headerStr.findIndex(h => h.includes("артикул"));
    dynamicColumnPositions.sku = headerStr.findIndex(h => h === "sku" || h.includes("sku"));
    dynamicColumnPositions.productName = headerStr.findIndex(h => h.includes("назван") || h.includes("товар"));
    dynamicColumnPositions.quantity = headerStr.findIndex(h => h.includes("количество"));
    dynamicColumnPositions.sellerPrice = headerStr.findIndex(h => h.includes("цена") && h.includes("продавц"));
    dynamicColumnPositions.orderDate = headerStr.findIndex(h => h.includes("дата") && (h.includes("принят") || h.includes("обработк")));
    dynamicColumnPositions.platform = headerStr.findIndex(h => h.includes("платформа"));
    dynamicColumnPositions.workScheme = headerStr.findIndex(h => h.includes("схема") || h.includes("работ"));
    dynamicColumnPositions.ozonCommissionPercent = headerStr.findIndex(h => h.includes("вознагражден") && (h.includes("%") || h.includes("ozon")));
    dynamicColumnPositions.localizationIndex = headerStr.findIndex(h => h.includes("индекс") && h.includes("локализац"));
    dynamicColumnPositions.avgDeliveryHours = headerStr.findIndex(h => h.includes("среднее") && (h.includes("время") || h.includes("доставк")));
    dynamicColumnPositions.totalAmount = headerStr.findIndex(h => (h.includes("сумма") && h.includes("итого")) || (h.includes("сумма") && h.includes("руб")));
    
    console.log(`   📊 Определённые позиции колонок:`);
    console.log(`      ID начисления: ${dynamicColumnPositions.chargeId}`);
    console.log(`      Сумма итого, руб.: ${dynamicColumnPositions.totalAmount}`);
    console.log(`      Тип начисления: ${dynamicColumnPositions.chargeType}`);
    console.log(`      Артикул: ${dynamicColumnPositions.article}`);
    
    // Проверяем, что критически важные колонки найдены
    if (dynamicColumnPositions.chargeId === -1) {
      console.error("   ⚠️ ВНИМАНИЕ: Не найдена колонка 'ID начисления'");
    }
    if (dynamicColumnPositions.totalAmount === -1) {
      console.error("   ⚠️ ВНИМАНИЕ: Не найдена колонка 'Сумма итого, руб.' - будут использованы фиксированные позиции");
      // Используем фиксированные позиции как fallback
      Object.assign(dynamicColumnPositions, OzonReportAnalyzer.COLUMN_POSITIONS);
    }
    
    // Пропускаем строки до данных (период и заголовки)
    // Данные начинаются со следующей строки после заголовков
    const dataStartRow = headerRowIndex + 1;
    this.rawRows = [];
    let skippedEmpty = 0;
    let totalAmountSum = 0;
    let rowsWithAmount = 0;
    
    console.log(`   Начало чтения данных со строки ${dataStartRow} (индекс ${dataStartRow})`);
    
    for (let i = dataStartRow; i < rawData.length; i++) {
      const row = rawData[i];
      if (row && row.length > 0) {
        // Используем динамически определённые позиции или фиксированные как fallback
        const positions = dynamicColumnPositions.totalAmount !== -1 
          ? dynamicColumnPositions 
          : OzonReportAnalyzer.COLUMN_POSITIONS;
        
        // Конвертируем массив в объект по позициям
        const totalAmount = row[positions.totalAmount];
        const chargeId = row[positions.chargeId];
        
        const rowObj: RawRow = {
          "ID начисления": chargeId,
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
          "Сумма итого, руб.": totalAmount,
        };
        
        // Диагностика сумм (логируем первые несколько для отладки)
        if (totalAmount !== undefined && totalAmount !== null && totalAmount !== "") {
          const amountNum = typeof totalAmount === "number" ? totalAmount : parseFloat(String(totalAmount).replace(/,/g, "."));
          if (!isNaN(amountNum)) {
            totalAmountSum += amountNum;
            rowsWithAmount++;
            
            // Логируем первые 3 строки с суммами для диагностики
            if (rowsWithAmount <= 3) {
              console.log(`      ✅ Строка ${rowsWithAmount}: найдена сумма=${amountNum}, из колонки индекс=${positions.totalAmount}, значение в строке=${row[positions.totalAmount]}`);
            }
          } else if (rowsWithAmount === 0 && this.rawRows.length <= 3) {
            // Логируем первые строки без сумм для диагностики
            console.log(`      ⚠️ Строка ${this.rawRows.length + 1}: сумма не найдена, индекс колонки=${positions.totalAmount}, длина строки=${row.length}, значение в этой позиции=${row[positions.totalAmount]}`);
            console.log(`         Все значения строки: ${JSON.stringify(row.slice(0, Math.min(16, row.length)))}`);
          }
        } else if (rowsWithAmount === 0 && this.rawRows.length <= 3) {
          // Логируем первые строки без сумм для диагностики
          console.log(`      ⚠️ Строка ${this.rawRows.length + 1}: сумма undefined, индекс колонки=${positions.totalAmount}, длина строки=${row.length}`);
          console.log(`         Все значения строки: ${JSON.stringify(row.slice(0, Math.min(16, row.length)))}`);
        }
        
        this.rawRows.push(rowObj);
      } else {
        skippedEmpty++;
      }
    }
    
    console.log("📋 [Parser] Результаты парсинга:");
    console.log(`   Прочитано строк данных: ${this.rawRows.length}`);
    console.log(`   Пропущено пустых строк: ${skippedEmpty}`);
    console.log(`   Файл был конвертирован: ${this.wasConverted ? "ДА" : "НЕТ"}`);
    console.log(`   Строк с суммой: ${rowsWithAmount}`);
    console.log(`   Сумма всех сумм (диагностика): ${totalAmountSum.toLocaleString("ru-RU")} ₽`);
    
    // Показываем примеры первых строк данных
    if (this.rawRows.length > 0) {
      console.log(`   Примеры первых 3 строк:`);
      for (let i = 0; i < Math.min(3, this.rawRows.length); i++) {
        const row = this.rawRows[i];
        console.log(`      Строка ${i + 1}: ID="${row["ID начисления"]}", Сумма=${row["Сумма итого, руб."]}, Тип="${row["Тип начисления"]}"`);
      }
    } else {
      console.error("   ⚠️ ВНИМАНИЕ: Не прочитано ни одной строки данных!");
      console.error(`      Попробуйте проверить структуру файла. Возможно, заголовки в другой строке.`);
    }
    
    logger.fileParsed(this.rawRows.length, this.wasConverted);
    
    // Логируем примеры декодирования
    if (this.rawRows.length > 0) {
      const decodingSamples: Array<{ raw: string; decoded: string }> = [];
      for (let i = 0; i < Math.min(5, this.rawRows.length); i++) {
        const row = this.rawRows[i];
        const rawProductName = row["Название товара"];
        if (rawProductName) {
          const decodedProductName = this.getDecodedString(rawProductName);
          if (rawProductName !== decodedProductName || this.wasConverted) {
            decodingSamples.push({
              raw: String(rawProductName).substring(0, 50),
              decoded: decodedProductName.substring(0, 50),
            });
          }
        }
      }
      if (decodingSamples.length > 0) {
        console.log("🔤 [Decoder] Примеры декодирования названий товаров:");
        decodingSamples.slice(0, 3).forEach(sample => {
          console.log(`   "${sample.raw.substring(0, 30)}..." → "${sample.decoded.substring(0, 50)}..."`);
        });
        logger.decodingSample(decodingSamples);
      }
    }
  }
  
  private extractPeriod(worksheet: XLSX.WorkSheet): void {
    const cellA1 = worksheet["A1"];
    
    if (cellA1 && cellA1.v) {
      const value = String(cellA1.v);
      this.periodLabel = value;
      
      // Парсим "Период: DD.MM.YYYY-DD.MM.YYYY"
      const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})-(\d{2})\.(\d{2})\.(\d{4})/);
      
      if (match) {
        const [, sd, sm, sy, ed, em, ey] = match;
        this.periodStart = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
        this.periodEnd = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
      }
    }
  }
  
  // ===========================================================================
  // НОРМАЛИЗАЦИЯ И СОРТИРОВКА
  // ===========================================================================
  
  private normalizeAndSort(): void {
    // Нормализуем строки
    this.chargeRows = this.rawRows
      .map((row, index) => this.normalizeRow(row, index))
      .filter((row): row is ChargeRow => row !== null);
    
    // Сортируем по ID начисления (по возрастанию)
    this.chargeRows.sort((a, b) => {
      // Пустые ID в конец
      if (!a.chargeId && !b.chargeId) return 0;
      if (!a.chargeId) return 1;
      if (!b.chargeId) return -1;
      
      return a.chargeId.localeCompare(b.chargeId, undefined, { numeric: true });
    });
    
    console.log(`[Analyzer] Normalized and sorted ${this.chargeRows.length} rows`);
  }
  
  private normalizeRow(row: RawRow, index: number): ChargeRow | null {
    const chargeId = getString(row["ID начисления"]); // Не декодируем - цифры
    const chargeType = this.getDecodedString(row["Тип начисления"]); // Декодируем
    const totalAmount = getNumber(row["Сумма итого, руб."]);
    
    // Пропускаем полностью пустые строки
    if (!chargeId && !chargeType && totalAmount === 0) {
      return null;
    }
    
    // Извлекаем номер заказа из ID начисления
    const orderNumber = extractOrderNumber(chargeId);
    
    // Баллы за скидки - это тоже рубли (компенсация от Ozon)
    // Просто помечаем для детализации
    const isPoints = false; // getChargeCategory(chargeType) === "points";
    
    return {
      chargeId,
      orderNumber,
      chargeDate: parseDate(row["Дата начисления"]),
      serviceGroup: this.getDecodedString(row["Группа услуг"]), // Декодируем
      chargeType,
      article: this.getDecodedString(row["Артикул"]), // Декодируем (может быть на русском или латинице)
      sku: getString(row["SKU"]), // Не декодируем - код товара
      productName: this.getDecodedString(row["Название товара"]), // Декодируем
      quantity: getNumber(row["Количество"]),
      sellerPrice: getNumber(row["Цена продавца"]),
      orderDate: row["Дата принятия заказа в обработку или оказания услуги"]
        ? parseDate(row["Дата принятия заказа в обработку или оказания услуги"])
        : null,
      platform: this.getDecodedString(row["Платформа продажи"]), // Декодируем
      workScheme: this.getDecodedString(row["Схема работы"]), // Декодируем
      ozonCommissionPercent: getNumber(row["Вознаграждение Ozon, %"]),
      localizationIndex: getNumber(row["Индекс локализации, %"]),
      avgDeliveryHours: getNumber(row["Среднее время доставки, часы"]),
      totalAmount,
      isPoints,
    };
  }
  
  
  // ===========================================================================
  // АГРЕГАЦИЯ ЗАКАЗОВ
  // ===========================================================================
  
  private aggregateOrders(): AggregatedOrder[] {
    const orderMap = new Map<string, ChargeRow[]>();
    
    // Диагностика: сколько строк с orderNumber
    const withOrderNumber = this.chargeRows.filter(r => r.orderNumber).length;
    const withoutOrderNumber = this.chargeRows.length - withOrderNumber;
    console.log("🔍 [Aggregator] Диагностика заказов:");
    console.log("   Всего строк:", this.chargeRows.length);
    console.log("   С orderNumber:", withOrderNumber);
    console.log("   Без orderNumber:", withoutOrderNumber);
    
    // Показываем примеры chargeId
    if (this.chargeRows.length > 0) {
      console.log("   Примеры chargeId (первые 5):");
      this.chargeRows.slice(0, 5).forEach((row, idx) => {
        console.log(`      ${idx + 1}. "${row.chargeId}" → orderNumber: "${row.orderNumber || 'NULL'}"`);
      });
    }
    
    // Группируем строки по номеру заказа
    for (const row of this.chargeRows) {
      if (row.orderNumber) {
        if (!orderMap.has(row.orderNumber)) {
          orderMap.set(row.orderNumber, []);
        }
        orderMap.get(row.orderNumber)!.push(row);
      }
    }
    
    // Агрегируем каждый заказ
    const orders: AggregatedOrder[] = [];
    
    Array.from(orderMap.entries()).forEach(([orderNumber, rows]) => {
      const order = this.aggregateOrderRows(orderNumber, rows);
      orders.push(order);
    });
    
    // Сортируем по дате
    orders.sort((a, b) => b.chargeDate.getTime() - a.chargeDate.getTime());
    
    logger.ordersAggregated(orders.length);
    return orders;
  }
  
  private aggregateOrderRows(orderNumber: string, rows: ChargeRow[]): AggregatedOrder {
    // Собираем данные из всех строк (заполняем пустые поля)
    let article = "";
    let sku = "";
    let productName = "";
    let quantity = 0;
    let sellerPrice = 0;
    let platform = "";
    let workScheme = "";
    let orderDate: Date | null = null;
    let chargeDate = new Date();
    
    // Общая сумма заказа (ВСЕ строки: + и -)
    let totalAmountRub = 0;
    
    // Детализация по категориям типов начислений
    let revenueAmount = 0;      // Выручка
    let pointsAmount = 0;       // Баллы за скидки
    let commissionAmount = 0;   // Комиссия Ozon
    let logisticsAmount = 0;    // Логистика (доставка)
    let returnLogisticsAmount = 0; // Обратная логистика
    let acquiringAmount = 0;    // Эквайринг
    let otherAmount = 0;        // Прочее
    
    const chargeTypes: string[] = [];
    let hasReturnType = false;
    let hasPartialReturnType = false;
    
    for (const row of rows) {
      // Заполняем пустые поля из других строк
      // ВАЖНО: Берем артикул из любой строки, где он есть (не только из первой)
      if (!article && row.article && row.article.trim().length > 0) {
        article = row.article.trim();
      }
      if (!sku && row.sku && row.sku.trim().length > 0) {
        sku = row.sku.trim();
      }
      if (!productName && row.productName && row.productName.trim().length > 0) {
        productName = row.productName.trim();
      }
      if (row.quantity > 0) quantity = Math.max(quantity, row.quantity);
      if (row.sellerPrice > 0) sellerPrice = Math.max(sellerPrice, row.sellerPrice);
      if (!platform && row.platform) platform = row.platform;
      if (!workScheme && row.workScheme) workScheme = row.workScheme;
      if (!orderDate && row.orderDate) orderDate = row.orderDate;
      if (row.chargeDate) chargeDate = row.chargeDate;
      
      const amount = row.totalAmount;
      
      // Классифицируем по ТИПУ НАЧИСЛЕНИЯ
      const category = getChargeCategory(row.chargeType);
      
      // Все суммы идут в totalAmountRub (включая баллы - это тоже деньги)
      totalAmountRub += amount;
      
      switch (category) {
        case "revenue":
          revenueAmount += amount;
          break;
        case "points":
          // Баллы за скидки - компенсация от Ozon
          pointsAmount += amount;
          break;
        case "commission":
          commissionAmount += amount; // Отрицательное значение
          break;
        case "logistics":
          logisticsAmount += amount; // Отрицательное значение
          break;
        case "returnLogistics":
          returnLogisticsAmount += amount;
          hasReturnType = true;
          break;
        case "returnRevenue":
        case "returnCommission":
        case "returnProcessing":
          hasReturnType = true;
          otherAmount += amount;
          break;
        case "partialReturn":
          hasPartialReturnType = true;
          otherAmount += amount;
          break;
        case "acquiring":
          acquiringAmount += amount;
          break;
        default:
          otherAmount += amount;
      }
      
      // Собираем типы начислений
      if (row.chargeType && !chargeTypes.includes(row.chargeType)) {
        chargeTypes.push(row.chargeType);
      }
    }
    
    // Определяем статус ПО ТИПАМ НАЧИСЛЕНИЙ (не по сумме!)
    let status: OrderStatus = "completed";
    
    if (hasPartialReturnType) {
      status = "partial_return";
    } else if (hasReturnType) {
      status = "returned";
    }
    
    // Валовая выручка = Выручка + Баллы
    const grossRevenue = revenueAmount + pointsAmount;
    
    // Суммируем все удержания (берём абсолютные значения)
    const totalFees = Math.abs(commissionAmount) + 
                      Math.abs(logisticsAmount) + 
                      Math.abs(returnLogisticsAmount) + 
                      Math.abs(acquiringAmount) +
                      Math.abs(otherAmount < 0 ? otherAmount : 0); // Только отрицательные
    
    return {
      orderNumber,
      status,
      article,
      sku,
      productName: productName || "Неизвестный товар",
      quantity,
      sellerPrice,
      // Итого к выплате
      totalAmountRub: round(totalAmountRub),
      // Детализация доходов
      revenueAmount: round(revenueAmount),
      pointsAmount: round(pointsAmount),
      grossRevenue: round(grossRevenue),
      // Детализация удержаний
      commissionAmount: round(Math.abs(commissionAmount)),
      logisticsAmount: round(Math.abs(logisticsAmount)),
      acquiringAmount: round(Math.abs(acquiringAmount)),
      returnAmount: round(Math.abs(returnLogisticsAmount)),
      otherFeesAmount: round(Math.abs(otherAmount < 0 ? otherAmount : 0)),
      totalFees: round(totalFees),
      // Мета
      platform,
      workScheme,
      orderDate,
      chargeDate,
      chargesCount: rows.length,
      chargeTypes,
    };
  }
  
  // ===========================================================================
  // НАЧИСЛЕНИЯ БЕЗ ЗАКАЗОВ
  // ===========================================================================
  
  private aggregateNonOrderCharges(): NonOrderCharge[] {
    const chargeMap = new Map<string, { rows: ChargeRow[]; serviceGroup: string }>();
    
    // Группируем по типу начисления
    for (const row of this.chargeRows) {
      // Пропускаем строки с заказами и подписки
      if (row.orderNumber) continue;
      if (SUBSCRIPTION_PATTERN.test(row.chargeId)) continue;
      
      // Пропускаем если есть название товара (значит есть связь)
      // if (row.productName) continue;
      
      const key = row.chargeType || row.serviceGroup || "Прочее";
      
      if (!chargeMap.has(key)) {
        chargeMap.set(key, { rows: [], serviceGroup: row.serviceGroup });
      }
      chargeMap.get(key)!.rows.push(row);
    }
    
    // Агрегируем
    const charges: NonOrderCharge[] = [];
    
    Array.from(chargeMap.entries()).forEach(([chargeType, data]) => {
      let totalRub = 0;
      let totalPoints = 0;
      
      for (const row of data.rows) {
        if (row.isPoints) {
          totalPoints += row.totalAmount;
        } else {
          totalRub += row.totalAmount;
        }
      }
      
      charges.push({
        serviceGroup: data.serviceGroup,
        chargeType,
        totalAmountRub: round(totalRub),
        totalAmountPoints: round(totalPoints),
        count: data.rows.length,
        description: this.getChargeDescription(chargeType, data.serviceGroup),
      });
    });
    
    // Сортируем по сумме
    charges.sort((a, b) => Math.abs(b.totalAmountRub) - Math.abs(a.totalAmountRub));
    
    logger.debug("Aggregator", `Найдено ${charges.length} начислений без заказов`);
    return charges;
  }
  
  private getChargeDescription(chargeType: string, serviceGroup: string): string {
    const type = chargeType.toLowerCase();
    
    if (type.includes("хранен")) return "Затраты на хранение товаров на складе";
    if (type.includes("реклам") || type.includes("продвиж")) return "Затраты на рекламу и продвижение";
    if (type.includes("штраф")) return "Штрафы от маркетплейса";
    if (type.includes("компенс")) return "Компенсации";
    if (type.includes("подписк")) return "Плата за подписку";
    
    return `${serviceGroup}: ${chargeType}`;
  }
  
  // ===========================================================================
  // ПОДПИСКИ
  // ===========================================================================
  
  private extractSubscriptions(): SubscriptionCharge[] {
    const subscriptions: SubscriptionCharge[] = [];
    
    for (const row of this.chargeRows) {
      // Ищем ID в формате даты
      if (SUBSCRIPTION_PATTERN.test(row.chargeId)) {
        subscriptions.push({
          period: row.chargeId,
          chargeType: row.chargeType || "Подписка",
          totalAmount: row.totalAmount,
          chargeDate: row.chargeDate,
        });
      }
    }
    
    logger.debug("Aggregator", `Найдено ${subscriptions.length} подписок`);
    return subscriptions;
  }
  
  // ===========================================================================
  // ДОБАВЛЕНИЕ СЕБЕСТОИМОСТИ К ЗАКАЗАМ
  // ===========================================================================
  
  private addCostToOrders(orders: AggregatedOrder[]): void {
    // Собираем уникальные артикулы из заказов (всегда, даже без файла себестоимости)
    const orderArticles = new Set<string>();
    const orderArticlesMap = new Map<string, { count: number; examples: string[] }>();
    
    for (const order of orders) {
      const article = (order.article || "").trim();
      if (article) {
        orderArticles.add(article);
        if (!orderArticlesMap.has(article)) {
          orderArticlesMap.set(article, { count: 0, examples: [] });
        }
        const info = orderArticlesMap.get(article)!;
        info.count++;
        if (info.examples.length < 3) {
          info.examples.push(order.orderNumber || "");
        }
      }
    }
    
    // Получаем артикулы из файла себестоимости (если есть)
    const costArticles = this.costData && this.costData.size > 0 
      ? Array.from(this.costData.keys())
      : [];
    
    console.log("📋 [CostMatch] Сохранение артикулов для сравнения:");
    console.log(`   Артикулов из файла себестоимости: ${costArticles.length}`);
    console.log(`   Артикулов из заказов: ${orderArticles.size}`);
    
    // Сохраняем списки артикулов для визуального сравнения (всегда)
    this.articlesComparison = {
      costArticles: costArticles.sort(),
      orderArticles: Array.from(orderArticles).sort(),
    };
    
    if (!this.costData || this.costData.size === 0) {
      console.log("⚠️ [CostMatch] Файл себестоимости не загружен или пуст");
      console.log("   Уникальных артикулов в заказах:", orderArticles.size);
      return;
    }
    
    console.log("=".repeat(60));
    console.log("🔍 [CostMatch] Анализ сопоставления артикулов");
    console.log("   Записей в файле себестоимости:", this.costData.size);
    console.log("   Всего заказов для проверки:", orders.length);
    console.log("   Примеры артикулов из файла себестоимости (первые 10):");
    costArticles.slice(0, 10).forEach((art, idx) => {
      console.log(`      ${idx + 1}. "${art}" (себестоимость: ${this.costData!.get(art)} ₽)`);
    });
    console.log("   Уникальных артикулов в заказах:", orderArticles.size);
    console.log("   Примеры артикулов из заказов (первые 10):");
    Array.from(orderArticles).slice(0, 10).forEach((art, idx) => {
      const info = orderArticlesMap.get(art);
      console.log(`      ${idx + 1}. "${art}" (заказов: ${info?.count || 0})`);
    });
    
    // Попытки сопоставления
    let matched = 0;
    let notMatched = 0;
    const notMatchedExamples: string[] = [];
    const matchedExamples: string[] = [];
    
    for (const order of orders) {
      const article = (order.article || "").trim();
      if (!article) {
        continue;
      }
      
      // Прямое сопоставление
      if (this.costData.has(article)) {
        const costPerUnit = this.costData.get(article)!;
        order.costPerUnit = round(costPerUnit);
        order.totalCost = round(costPerUnit * (order.quantity || 1));
        order.hasCost = true;
        matched++;
        if (matchedExamples.length < 5) {
          matchedExamples.push(article);
        }
      } else {
        order.hasCost = false;
        notMatched++;
        if (notMatchedExamples.length < 10) {
          notMatchedExamples.push(article);
        }
        
        // Попытка сопоставления без учета регистра
        const lowerArticle = article.toLowerCase();
        let found = false;
        for (const costArt of costArticles) {
          if (costArt.toLowerCase() === lowerArticle) {
            const costPerUnit = this.costData.get(costArt)!;
            order.costPerUnit = round(costPerUnit);
            order.totalCost = round(costPerUnit * (order.quantity || 1));
            order.hasCost = true;
            matched++;
            found = true;
            console.log(`   ✅ Найдено сопоставление (без учета регистра): "${article}" <-> "${costArt}"`);
            break;
          }
        }
        
        if (!found) {
          // Попытка сопоставления с удалением пробелов
          const noSpacesArticle = article.replace(/\s/g, "");
          for (const costArt of costArticles) {
            const noSpacesCostArt = costArt.replace(/\s/g, "");
            if (noSpacesCostArt === noSpacesArticle || noSpacesCostArt.toLowerCase() === noSpacesArticle.toLowerCase()) {
              const costPerUnit = this.costData.get(costArt)!;
              order.costPerUnit = round(costPerUnit);
              order.totalCost = round(costPerUnit * (order.quantity || 1));
              order.hasCost = true;
              matched++;
              found = true;
              console.log(`   ✅ Найдено сопоставление (без пробелов): "${article}" <-> "${costArt}"`);
              break;
            }
          }
        }
        
        if (!found) {
          // Остается hasCost = false
        }
      }
    }
    
    console.log("   Результаты сопоставления:");
    console.log(`      Сопоставлено: ${matched} заказов`);
    console.log(`      Не сопоставлено: ${notMatched} заказов`);
    
    if (matchedExamples.length > 0) {
      console.log("   Примеры успешного сопоставления:");
      matchedExamples.forEach((art, idx) => {
        console.log(`      ${idx + 1}. "${art}"`);
      });
    }
    
    if (notMatchedExamples.length > 0) {
      console.log("   Примеры НЕ сопоставленных артикулов:");
      notMatchedExamples.slice(0, 10).forEach((art, idx) => {
        console.log(`      ${idx + 1}. "${art}"`);
        
        // Показываем похожие артикулы из файла себестоимости
        const similar = costArticles.filter(ca => {
          const lower1 = art.toLowerCase();
          const lower2 = ca.toLowerCase();
          return lower1.includes(lower2.substring(0, 5)) || lower2.includes(lower1.substring(0, 5));
        }).slice(0, 3);
        
        if (similar.length > 0) {
          console.log(`         Похожие в файле себестоимости: ${similar.map(s => `"${s}"`).join(", ")}`);
        }
      });
    }
    
    // Статистика по уникальным артикулам
    const uniqueOrderArticles = Array.from(orderArticles);
    const matchedUnique = uniqueOrderArticles.filter(art => {
      if (!this.costData) return false;
      return this.costData.has(art) || 
             costArticles.some(ca => ca.toLowerCase() === art.toLowerCase()) ||
             costArticles.some(ca => ca.replace(/\s/g, "").toLowerCase() === art.replace(/\s/g, "").toLowerCase());
    });
    
    console.log(`   Уникальных артикулов в заказах: ${uniqueOrderArticles.length}`);
    console.log(`   Из них сопоставлено: ${matchedUnique.length}`);
    console.log(`   Не сопоставлено: ${uniqueOrderArticles.length - matchedUnique.length}`);
    console.log("=".repeat(60));
  }
  
  /**
   * Сохраняет списки артикулов в файлы для визуального сравнения
   */
  private saveArticlesForComparison(costArticles: string[], orderArticles: string[]): void {
    try {
      const outputDir = path.join(process.cwd(), "test", "articles-comparison");
      
      // Создаем директорию, если её нет
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      
      // Файл 1: Артикулы из файла себестоимости
      const costFilePath = path.join(outputDir, `cost-articles-${timestamp}.json`);
      const costData = {
        total: costArticles.length,
        articles: costArticles.sort().map((art, idx) => ({
          index: idx + 1,
          article: art,
          length: art.length,
          hasCyrillic: /[а-яё]/i.test(art),
          hasLatin: /[a-z]/i.test(art),
          hasNumbers: /\d/.test(art),
          hasSpaces: /\s/.test(art),
          bytes: Buffer.from(art, 'utf-8').toString('hex'),
        })),
      };
      
      fs.writeFileSync(costFilePath, JSON.stringify(costData, null, 2), "utf-8");
      console.log(`\n📄 [CostMatch] Список артикулов из файла себестоимости сохранен:`);
      console.log(`   ${costFilePath}`);
      
      // Файл 2: Артикулы из файла начислений
      const ordersFilePath = path.join(outputDir, `orders-articles-${timestamp}.json`);
      const ordersData = {
        total: orderArticles.length,
        articles: orderArticles.sort().map((art, idx) => ({
          index: idx + 1,
          article: art,
          length: art.length,
          hasCyrillic: /[а-яё]/i.test(art),
          hasLatin: /[a-z]/i.test(art),
          hasNumbers: /\d/.test(art),
          hasSpaces: /\s/.test(art),
          bytes: Buffer.from(art, 'utf-8').toString('hex'),
        })),
      };
      
      fs.writeFileSync(ordersFilePath, JSON.stringify(ordersData, null, 2), "utf-8");
      console.log(`📄 [CostMatch] Список артикулов из файла начислений сохранен:`);
      console.log(`   ${ordersFilePath}`);
      
      // Файл 3: Сравнительная таблица
      const comparisonFilePath = path.join(outputDir, `comparison-${timestamp}.txt`);
      let comparisonText = "=".repeat(80) + "\n";
      comparisonText += "СРАВНЕНИЕ АРТИКУЛОВ\n";
      comparisonText += "=".repeat(80) + "\n\n";
      
      comparisonText += `Артикулов в файле себестоимости: ${costArticles.length}\n`;
      comparisonText += `Артикулов в файле начислений: ${orderArticles.length}\n\n`;
      comparisonText += "=".repeat(80) + "\n";
      comparisonText += "АРТИКУЛЫ ИЗ ФАЙЛА СЕБЕСТОИМОСТИ (первые 50):\n";
      comparisonText += "=".repeat(80) + "\n\n";
      
      costArticles.sort().slice(0, 50).forEach((art, idx) => {
        comparisonText += `${String(idx + 1).padStart(3, " ")}. "${art}"\n`;
      });
      
      comparisonText += "\n" + "=".repeat(80) + "\n";
      comparisonText += "АРТИКУЛЫ ИЗ ФАЙЛА НАЧИСЛЕНИЙ (первые 50):\n";
      comparisonText += "=".repeat(80) + "\n\n";
      
      orderArticles.sort().slice(0, 50).forEach((art, idx) => {
        comparisonText += `${String(idx + 1).padStart(3, " ")}. "${art}"\n`;
      });
      
      comparisonText += "\n" + "=".repeat(80) + "\n";
      comparisonText += "ПОПЫТКИ СОПОСТАВЛЕНИЯ (первые 20 из каждого):\n";
      comparisonText += "=".repeat(80) + "\n\n";
      
      const costSorted = costArticles.sort().slice(0, 20);
      const ordersSorted = orderArticles.sort().slice(0, 20);
      
      comparisonText += "Файл себестоимости → Файл начислений:\n\n";
      for (const costArt of costSorted) {
        comparisonText += `"${costArt}"\n`;
        const similar = ordersSorted.filter(oa => {
          const c1 = costArt.toLowerCase();
          const o1 = oa.toLowerCase();
          return c1 === o1 || 
                 c1.includes(o1.substring(0, Math.min(5, o1.length))) ||
                 o1.includes(c1.substring(0, Math.min(5, c1.length)));
        });
        if (similar.length > 0) {
          comparisonText += `  ✅ Похожие: ${similar.map(s => `"${s}"`).join(", ")}\n`;
        } else {
          comparisonText += `  ❌ Не найдено похожих\n`;
        }
        comparisonText += "\n";
      }
      
      fs.writeFileSync(comparisonFilePath, comparisonText, "utf-8");
      console.log(`📄 [CostMatch] Сравнительная таблица сохранена:`);
      console.log(`   ${comparisonFilePath}\n`);
      
    } catch (error: any) {
      console.error("❌ [CostMatch] Ошибка при сохранении списков артикулов:", error.message);
    }
  }
  
  // ===========================================================================
  // МЕТРИКИ ПО ТОВАРАМ
  // ===========================================================================
  
  private calculateProductMetrics(orders: AggregatedOrder[], costData?: Map<string, number>): ProductMetrics[] {
    const productMap = new Map<string, AggregatedOrder[]>();
    
    // Группируем заказы по SKU/артикулу
    for (const order of orders) {
      const key = order.sku || order.article;
      if (!key) continue;
      
      if (!productMap.has(key)) {
        productMap.set(key, []);
      }
      productMap.get(key)!.push(order);
    }
    
    const metrics: ProductMetrics[] = [];
    
    Array.from(productMap.entries()).forEach(([key, productOrders]) => {
      const firstOrder = productOrders[0];
      
      let totalSold = 0;
      let totalReturned = 0;
      let ordersCount = 0;
      let returnsCount = 0;
      let totalRevenue = 0;
      let totalCommission = 0;
      let totalLogistics = 0;
      let totalReturnsAmount = 0;
      let totalAmountRub = 0; // ВСЕ начисления по заказам (сумма всех строк)
      let totalCost = 0; // Общая себестоимость
      let totalCostSold = 0; // Себестоимость проданных товаров
      let hasCost = false;
      let commissionPercents: number[] = [];
      
      for (const order of productOrders) {
        if (order.status === "completed") {
          const qty = order.quantity || 1;
          totalSold += qty;
          ordersCount++;
          totalRevenue += order.grossRevenue;
          
          // Учитываем себестоимость проданных товаров (только если есть выручка)
          if (order.grossRevenue > 0 && order.hasCost && order.costPerUnit !== undefined) {
            totalCostSold += order.totalCost || (order.costPerUnit * qty);
            hasCost = true;
          }
        } else {
          totalReturned += order.quantity || 1;
          returnsCount++;
          totalReturnsAmount += order.returnAmount;
        }
        
        totalCommission += order.commissionAmount;
        totalLogistics += order.logisticsAmount;
        
        // ВАЖНО: Суммируем totalAmountRub - это сумма ВСЕХ строк заказа (включая все начисления)
        totalAmountRub += order.totalAmountRub;
        
        // Общая себестоимость (только для заказов с выручкой > 0, возвраты не учитываем)
        if (order.grossRevenue > 0 && order.hasCost && order.totalCost !== undefined) {
          totalCost += order.totalCost;
          hasCost = true;
        }
      }
      
      // Используем totalAmountRub вместо вычисления netAmount
      // totalAmountRub уже содержит сумму всех строк заказа (выручка, баллы, комиссия, логистика и т.д.)
      const netAmount = totalAmountRub;
      const marginPercent = totalRevenue > 0 ? (netAmount / totalRevenue) * 100 : 0;
      const returnRate = (ordersCount + returnsCount) > 0 
        ? (returnsCount / (ordersCount + returnsCount)) * 100 
        : 0;
      const avgCommission = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;
      
      const productName = firstOrder.productName || "";
      if (!productName) {
        console.warn(`[Analyzer] Product with key ${key} has no productName`);
      }
      
      // Получаем себестоимость из файла себестоимости (по артикулу)
      const article = firstOrder.article || "";
      let costPerUnit: number | undefined = undefined;
      let productHasCost = false; // Флаг наличия себестоимости для товара (из файла себестоимости)
      
      if (costData && article) {
        // Прямое сопоставление
        if (costData.has(article)) {
          costPerUnit = costData.get(article);
          productHasCost = true;
        } else {
          // Попытка без учета регистра
          const lowerArticle = article.toLowerCase();
          for (const [costArt, cost] of Array.from(costData.entries())) {
            if (costArt.toLowerCase() === lowerArticle) {
              costPerUnit = cost;
              productHasCost = true;
              console.log(`   ✅ [ProductMetrics] Найдено сопоставление (без учета регистра): "${article}" <-> "${costArt}" (товар: ${productName || key})`);
              break;
            }
          }
          
          // Попытка без пробелов
          if (costPerUnit === undefined) {
            const noSpacesArticle = article.replace(/\s/g, "");
            for (const [costArt, cost] of Array.from(costData.entries())) {
              if (costArt.replace(/\s/g, "").toLowerCase() === noSpacesArticle.toLowerCase()) {
                costPerUnit = cost;
                productHasCost = true;
                console.log(`   ✅ [ProductMetrics] Найдено сопоставление (без пробелов): "${article}" <-> "${costArt}" (товар: ${productName || key})`);
                break;
              }
            }
          }
          
          // Если не найдено, логируем для диагностики
          if (!productHasCost && article.length > 0) {
            // Ищем похожие артикулы
            const similar = Array.from(costData.keys()).filter(ca => {
              const artLower = article.toLowerCase();
              const costArtLower = ca.toLowerCase();
              return artLower.includes(costArtLower.substring(0, Math.min(5, costArtLower.length))) ||
                     costArtLower.includes(artLower.substring(0, Math.min(5, artLower.length)));
            }).slice(0, 3);
            
            if (similar.length > 0) {
              console.log(`   ⚠️ [ProductMetrics] Товар "${productName || key}" (артикул: "${article}") не найден в файле себестоимости. Похожие: ${similar.map(s => `"${s}"`).join(", ")}`);
            }
          }
        }
      } else if (article && !costData) {
        console.log(`   ⚠️ [ProductMetrics] Товар "${productName || key}" (артикул: "${article}") не имеет себестоимости - файл себестоимости не загружен`);
      } else if (!article) {
        console.log(`   ⚠️ [ProductMetrics] Товар "${productName || key}" (SKU: ${key}) не имеет артикула`);
      }
      
      // Расчёт чистой прибыли (только если есть выручка и себестоимость проданных)
      const netProfit = (productHasCost && totalCostSold > 0 && totalRevenue > 0) ? netAmount - totalCostSold : undefined;
      const profitMarginPercent = netProfit !== undefined && totalRevenue > 0 
        ? (netProfit / totalRevenue) * 100 
        : undefined;
      
      metrics.push({
        sku: firstOrder.sku || key,
        article: article,
        productName: productName,
        totalSold,
        totalReturned,
        ordersCount,
        returnsCount,
        totalRevenue: round(totalRevenue),
        totalCommission: round(totalCommission),
        totalLogistics: round(totalLogistics),
        totalReturnsAmount: round(totalReturnsAmount),
        netAmount: round(netAmount),
        costPerUnit: costPerUnit !== undefined ? round(costPerUnit) : undefined,
        totalCost: (productHasCost && totalCostSold > 0) ? round(totalCostSold) : undefined,
        netProfit: netProfit !== undefined ? round(netProfit) : undefined,
        avgOrderValue: ordersCount > 0 ? round(totalRevenue / ordersCount) : 0,
        avgCommissionPercent: round(avgCommission, 1),
        marginPercent: round(marginPercent, 1),
        profitMarginPercent: profitMarginPercent !== undefined ? round(profitMarginPercent, 1) : undefined,
        returnRate: round(returnRate, 1),
        hasCost: productHasCost, // Флаг наличия себестоимости из файла себестоимости (независимо от выручки)
        workScheme: firstOrder.workScheme,
        platform: firstOrder.platform,
      });
    });
    
    const sorted = metrics.sort((a, b) => b.netAmount - a.netAmount);
    
    const withNames = sorted.filter(p => p.productName && p.productName !== "Неизвестный товар" && p.productName.trim().length > 0).length;
    const withoutNames = sorted.length - withNames;
    
    logger.productsCalculated(sorted.length, withNames, withoutNames);
    
    if (sorted.length > 0) {
      const top5 = sorted.slice(0, 5).map(p => ({
        name: p.productName || "[БЕЗ НАЗВАНИЯ]",
        revenue: p.totalRevenue,
        profit: p.netAmount,
        orders: p.ordersCount,
        margin: p.marginPercent,
      }));
      logger.topProducts(top5);
      
      // Показываем примеры товаров без названий
      const withoutNamesList = sorted.filter(p => !p.productName || p.productName === "Неизвестный товар" || p.productName.trim().length === 0).slice(0, 3);
      if (withoutNamesList.length > 0) {
        logger.warn("Products", "Найдены товары без названий", {
          count: withoutNamesList.length,
          examples: withoutNamesList.map(p => ({ 
            sku: p.sku, 
            article: p.article, 
            orders: p.ordersCount,
            revenue: p.totalRevenue 
          })),
        });
      }
    }
    
    return sorted;
  }
  
  // ===========================================================================
  // СВОДКА И ЗАТРАТЫ
  // ===========================================================================
  
  private calculateSummary(
    orders: AggregatedOrder[],
    nonOrderCharges: NonOrderCharge[],
    subscriptions: SubscriptionCharge[],
    productMetrics?: ProductMetrics[]
  ): AnalysisResult["summary"] {
    // Счётчики
    let revenueAmount = 0;      // Только "Выручка"
    let pointsAmount = 0;       // Баллы за скидки
    let totalFees = 0;          // Все удержания
    let netPayout = 0;          // Итого к выплате
    let commissionSum = 0;
    let completedOrders = 0;
    let returnedOrders = 0;
    let partialReturns = 0;
    let cancelledOrders = 0;
    
    // Себестоимость
    let totalCost = 0;          // Общая себестоимость
    let totalCostSold = 0;      // Себестоимость проданных товаров
    let productsWithCost = 0;
    let productsWithoutCost = 0;
    let ordersWithCost = 0;
    let ordersWithoutCost = 0;
    
    const products = new Set<string>();
    
    // Суммируем по заказам
    for (const order of orders) {
      revenueAmount += order.revenueAmount;
      pointsAmount += order.pointsAmount;
      totalFees += order.totalFees;
      netPayout += order.totalAmountRub;
      commissionSum += order.commissionAmount;
      
      // Учитываем себестоимость заказов
      if (order.hasCost && order.totalCost !== undefined) {
        ordersWithCost++;
        totalCost += order.totalCost;
        
      // Учитываем себестоимость только проданных товаров (статус "completed" И выручка > 0)
      if (order.status === "completed" && order.grossRevenue > 0) {
        totalCostSold += order.totalCost;
      }
      } else {
        ordersWithoutCost++;
      }
      
      // Проверяем, является ли заказ отмененным (только эквайринг, 2 строки)
      // Отмененные заказы: только 2 строки, обе с типом "Эквайринг"
      const isCancelled = order.chargesCount === 2 && 
                         order.chargeTypes.length === 1 && 
                         order.chargeTypes[0].includes("Эквайринг");
      
      if (isCancelled) {
        cancelledOrders++;
      } else {
        // Подсчёт статусов (если не отмененный)
        if (order.status === "completed") {
          completedOrders++;
        } else if (order.status === "returned") {
          returnedOrders++;
        } else {
          partialReturns++;
        }
      }
      
      if (order.sku || order.article) {
        products.add(order.sku || order.article);
      }
    }
    
    // Считаем товары с себестоимостью и без
    if (productMetrics) {
      for (const product of productMetrics) {
        if (product.hasCost && product.costPerUnit !== undefined) {
          productsWithCost++;
        } else {
          productsWithoutCost++;
        }
      }
    }
    
    // Добавляем начисления без заказов
    for (const charge of nonOrderCharges) {
      netPayout += charge.totalAmountRub;
      // Отрицательные - это удержания
      if (charge.totalAmountRub < 0) {
        totalFees += Math.abs(charge.totalAmountRub);
      } else {
        // Положительные - это доход (компенсации и т.д.)
        revenueAmount += charge.totalAmountRub;
      }
    }
    
    // Добавляем подписки (всегда отрицательные)
    for (const sub of subscriptions) {
      netPayout += sub.totalAmount;
      totalFees += Math.abs(sub.totalAmount);
    }
    
    // Валовая выручка = Выручка + Баллы
    const grossRevenue = revenueAmount + pointsAmount;
    
    // Процент удержаний
    const feesPercent = grossRevenue > 0 ? (totalFees / grossRevenue) * 100 : 0;
    
    // Процент возвратов
    const returnRate = orders.length > 0
      ? (returnedOrders / orders.length) * 100
      : 0;
    
    // Средний процент комиссии
    const avgCommission = grossRevenue > 0 ? (commissionSum / grossRevenue) * 100 : 0;
    
    const totalNetProfit = totalCostSold > 0 ? netPayout - totalCostSold : undefined;
    
    return {
      // Финансы
      grossRevenue: round(grossRevenue),
      revenueAmount: round(revenueAmount),
      pointsAmount: round(pointsAmount),
      ozonFees: round(totalFees),
      netPayout: round(netPayout),
      feesPercent: round(feesPercent, 1),
      // Заказы
      totalOrders: orders.length,
      completedOrders,
      returnedOrders,
      partialReturns,
      cancelledOrders,
      // Прочее
      totalProducts: products.size,
      avgOrderValue: completedOrders > 0 ? round(grossRevenue / completedOrders) : 0,
      avgCommissionPercent: round(avgCommission, 1),
      returnRate: round(returnRate, 1),
      // Себестоимость
      totalCost: totalCost > 0 ? round(totalCost) : undefined,
      totalCostSold: totalCostSold > 0 ? round(totalCostSold) : undefined,
      totalNetProfit: totalNetProfit !== undefined ? round(totalNetProfit) : undefined,
      productsWithCost: productsWithCost > 0 ? productsWithCost : undefined,
      productsWithoutCost: productsWithoutCost > 0 ? productsWithoutCost : undefined,
      ordersWithCost: ordersWithCost > 0 ? ordersWithCost : undefined,
      ordersWithoutCost: ordersWithoutCost > 0 ? ordersWithoutCost : undefined,
    };
  }
  
  private calculateCostBreakdown(
    orders: AggregatedOrder[],
    nonOrderCharges: NonOrderCharge[],
    subscriptions: SubscriptionCharge[]
  ): CostBreakdown {
    let commission = 0;
    let logistics = 0;
    let returns = 0;
    let storage = 0;
    let advertising = 0;
    let penalties = 0;
    let subscriptionsCost = 0;
    let other = 0;
    
    // Из заказов
    for (const order of orders) {
      commission += order.commissionAmount;
      logistics += order.logisticsAmount;
      returns += order.returnAmount;
    }
    
    // Из начислений без заказов
    for (const charge of nonOrderCharges) {
      const type = charge.chargeType.toLowerCase();
      const amount = Math.abs(charge.totalAmountRub);
      
      if (type.includes("хранен") || type.includes("размещен")) {
        storage += amount;
      } else if (type.includes("реклам") || type.includes("продвиж") || type.includes("трафарет")) {
        advertising += amount;
      } else if (type.includes("штраф")) {
        penalties += amount;
      } else if (charge.totalAmountRub < 0) {
        other += amount;
      }
    }
    
    // Подписки
    for (const sub of subscriptions) {
      subscriptionsCost += Math.abs(sub.totalAmount);
    }
    
    const total = commission + logistics + returns + storage + advertising + penalties + subscriptionsCost + other;
    
    return {
      commission: round(commission),
      logistics: round(logistics),
      returns: round(returns),
      storage: round(storage),
      advertising: round(advertising),
      penalties: round(penalties),
      subscriptions: round(subscriptionsCost),
      other: round(other),
      total: round(total),
    };
  }
  
  // ===========================================================================
  // МЕТРИКИ ПО ДНЯМ
  // ===========================================================================
  
  private calculateDailyMetrics(orders: AggregatedOrder[]): DailyMetrics[] {
    const byDate = new Map<string, AggregatedOrder[]>();
    
    for (const order of orders) {
      const dateKey = formatDate(order.chargeDate);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(order);
    }
    
    const metrics: DailyMetrics[] = [];
    
    Array.from(byDate.entries()).forEach(([date, dayOrders]) => {
      let ordersCount = 0;
      let returnsCount = 0;
      let revenue = 0;
      let commission = 0;
      let logistics = 0;
      let returns = 0;
      let pointsAmount = 0;
      let totalCost = 0; // Себестоимость за день
      
      for (const order of dayOrders) {
        if (order.status === "completed") {
          ordersCount++;
          revenue += order.grossRevenue;
          
          // Учитываем себестоимость только для проданных товаров с выручкой > 0
          if (order.grossRevenue > 0 && order.hasCost && order.totalCost !== undefined) {
            totalCost += order.totalCost;
          }
        } else {
          returnsCount++;
          returns += order.returnAmount;
        }
        
        commission += order.commissionAmount;
        logistics += order.logisticsAmount;
        pointsAmount += order.pointsAmount;
      }
      
      const netAmount = round(revenue - commission - logistics - returns);
      const costRounded = round(totalCost);
      const netProfit = costRounded > 0 ? round(netAmount - costRounded) : undefined;
      
      metrics.push({
        date,
        ordersCount,
        returnsCount,
        revenue: round(revenue),
        commission: round(commission),
        logistics: round(logistics),
        returns: round(returns),
        netAmount,
        pointsAmount: round(pointsAmount),
        totalCost: costRounded > 0 ? costRounded : undefined,
        netProfit,
      });
    });
    
    return metrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  
  // ===========================================================================
  // СТАТИСТИКА ПО СХЕМАМ
  // ===========================================================================
  
  private calculateSchemeStats(orders: AggregatedOrder[]): AnalysisResult["schemeStats"] {
    const stats = {
      fbo: { orders: 0, amount: 0 },
      fbs: { orders: 0, amount: 0 },
      other: { orders: 0, amount: 0 },
    };
    
    for (const order of orders) {
      const scheme = order.workScheme.toUpperCase();
      
      if (scheme.includes("FBO")) {
        stats.fbo.orders++;
        stats.fbo.amount += order.totalAmountRub;
      } else if (scheme.includes("FBS")) {
        stats.fbs.orders++;
        stats.fbs.amount += order.totalAmountRub;
      } else {
        stats.other.orders++;
        stats.other.amount += order.totalAmountRub;
      }
    }
    
    stats.fbo.amount = round(stats.fbo.amount);
    stats.fbs.amount = round(stats.fbs.amount);
    stats.other.amount = round(stats.other.amount);
    
    return stats;
  }
  
  // ===========================================================================
  // ДЕТАЛИЗАЦИЯ ПО ТИПАМ НАЧИСЛЕНИЙ (ГРУППИРОВКА)
  // ===========================================================================
  
  /**
   * Рассчитывает детализацию по типам начислений с группировкой
   * Собирает данные из всех строк начислений (chargeRows)
   */
  private calculateChargeTypeBreakdown(): Array<{
    groupName: string;
    amount: number;
    count: number;
    chargeTypes: Array<{ name: string; amount: number; count: number }>;
  }> {
    // Карта для группировки: groupName -> { amount, count, chargeTypes }
    const groupMap = new Map<string, {
      amount: number;
      count: number;
      chargeTypes: Map<string, { amount: number; count: number }>;
    }>();
    
    // Собираем все типы начислений из всех строк
    // Используем знаки напрямую из файла (столбец "Сумма итого, руб.")
    for (const row of this.chargeRows) {
      const chargeType = row.chargeType || row.serviceGroup || "Прочее";
      
      // Берем сумму напрямую из файла без изменений знака
      const amount = row.totalAmount;
      
      // Определяем группу для этого типа начисления
      const group = getChargeGroup(chargeType);
      
      // Инициализируем группу, если её ещё нет
      if (!groupMap.has(group)) {
        groupMap.set(group, { amount: 0, count: 0, chargeTypes: new Map() });
      }
      
      const groupData = groupMap.get(group)!;
      
      // Добавляем сумму и счётчик в группу
      groupData.amount += amount;
      groupData.count++;
      
      // Добавляем тип начисления в группу
      if (!groupData.chargeTypes.has(chargeType)) {
        groupData.chargeTypes.set(chargeType, { amount: 0, count: 0 });
      }
      
      const chargeTypeData = groupData.chargeTypes.get(chargeType)!;
      chargeTypeData.amount += amount;
      chargeTypeData.count++;
    }
    
    // Преобразуем карту в массив с сортировкой
    const result = Array.from(groupMap.entries())
      .map(([groupName, data]) => ({
        groupName,
        amount: data.amount,
        count: data.count,
        chargeTypes: Array.from(data.chargeTypes.entries())
          .map(([name, typeData]) => ({
            name,
            amount: typeData.amount,
            count: typeData.count,
          }))
          .sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.amount - a.amount);
    
    return result;
  }
  
  // ===========================================================================
  // ТОПЫ И ПРОБЛЕМНЫЕ
  // ===========================================================================
  
  private getTopProducts(metrics: ProductMetrics[], limit: number): ProductMetrics[] {
    return [...metrics]
      .filter(p => p.netAmount > 0)
      .sort((a, b) => b.netAmount - a.netAmount)
      .slice(0, limit);
  }
  
  private getWorstProducts(metrics: ProductMetrics[], limit: number): ProductMetrics[] {
    return [...metrics]
      .filter(p => {
        // Исключаем товары с нулевой выручкой и нулевой прибылью (возвращенные товары)
        if (p.totalRevenue === 0 && (p.netAmount === 0 || p.netAmount >= 0)) {
          return false;
        }
        
        // Товар попадает в убыточные, если:
        // 1. Маржа < 15% И выручка > 0 (реальные продажи с низкой маржой)
        // 2. Возвраты > 10% И выручка > 0 (высокий процент возвратов)
        // 3. Отрицательная прибыль (реальные убытки)
        const hasRevenue = p.totalRevenue > 0;
        const margin = p.marginPercent || 0;
        const returnRate = p.returnRate || 0;
        const netAmount = p.netAmount || 0;
        
        return (hasRevenue && margin < 15) || (hasRevenue && returnRate > 10) || netAmount < 0;
      })
      .sort((a, b) => {
        // Сортируем: сначала товары с отрицательной прибылью, потом по марже
        if (a.netAmount < 0 && b.netAmount >= 0) return -1;
        if (a.netAmount >= 0 && b.netAmount < 0) return 1;
        return (a.marginPercent || 0) - (b.marginPercent || 0);
      })
      .slice(0, limit);
  }
  
  private getTopOrders(orders: AggregatedOrder[], limit: number): AggregatedOrder[] {
    return [...orders]
      .filter(o => o.status === "completed")
      .sort((a, b) => b.totalAmountRub - a.totalAmountRub)
      .slice(0, limit);
  }
  
  // ===========================================================================
  // ПРОБЛЕМНЫЕ ЗОНЫ И РЕКОМЕНДАЦИИ
  // ===========================================================================
  
  private identifyProblemAreas(
    orders: AggregatedOrder[],
    products: ProductMetrics[],
    costs: CostBreakdown
  ): ProblemArea[] {
    const problems: ProblemArea[] = [];
    
    // 1. Высокий процент возвратов
    const highReturnProducts = products.filter(p => p.returnRate > 10);
    if (highReturnProducts.length > 0) {
      problems.push({
        type: "high_returns",
        severity: highReturnProducts.length > 5 ? "high" : "medium",
        title: "Высокий процент возвратов",
        description: `${highReturnProducts.length} товаров с возвратами выше 10%`,
        affectedItems: highReturnProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(highReturnProducts.reduce((sum, p) => sum + p.totalReturnsAmount, 0)),
        recommendation: "Улучшите описания, фотографии и размерные сетки",
      });
    }
    
    // 2. Убыточные товары
    const unprofitableProducts = products.filter(p => p.netAmount < 0);
    if (unprofitableProducts.length > 0) {
      problems.push({
        type: "negative_margin",
        severity: "critical",
        title: "Убыточные товары",
        description: `${unprofitableProducts.length} товаров продаются в минус`,
        affectedItems: unprofitableProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(Math.abs(unprofitableProducts.reduce((sum, p) => sum + p.netAmount, 0))),
        recommendation: "Пересмотрите цены или снимите с продажи",
      });
    }
    
    // 3. Штрафы
    if (costs.penalties > 500) {
      problems.push({
        type: "penalties",
        severity: costs.penalties > 3000 ? "high" : "medium",
        title: "Штрафы от маркетплейса",
        description: `Сумма штрафов: ${costs.penalties.toLocaleString()} ₽`,
        affectedItems: [],
        potentialLoss: costs.penalties,
        recommendation: "Проанализируйте причины штрафов",
      });
    }
    
    // 4. Высокая комиссия
    const highCommissionProducts = products.filter(p => p.avgCommissionPercent > 20);
    if (highCommissionProducts.length > 3) {
      problems.push({
        type: "high_commission",
        severity: "medium",
        title: "Высокая комиссия",
        description: `${highCommissionProducts.length} товаров с комиссией выше 20%`,
        affectedItems: highCommissionProducts.slice(0, 5).map(p => p.sku || p.article),
        potentialLoss: round(highCommissionProducts.reduce((sum, p) => sum + p.totalCommission, 0) * 0.2),
        recommendation: "Рассмотрите смену категории товаров",
      });
    }
    
    return problems.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    });
  }
  
  private generateRecommendations(
    summary: AnalysisResult["summary"],
    costs: CostBreakdown,
    problems: ProblemArea[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    
    // По удержаниям Ozon
    if (summary.feesPercent > 50) {
      recommendations.push({
        id: "rec_fees",
        type: "profit",
        priority: "high",
        title: "Снизьте удержания Ozon",
        description: `Удержания составляют ${summary.feesPercent}% от выручки`,
        impact: `При снижении до 45%: +${round((summary.feesPercent - 45) * summary.grossRevenue / 100).toLocaleString()} ₽`,
        actions: [
          "Оптимизируйте логистику (FBS vs FBO)",
          "Пересмотрите ценовую политику",
          "Снизьте процент возвратов",
        ],
      });
    }
    
    // По возвратам
    if (summary.returnRate > 5) {
      recommendations.push({
        id: "rec_returns",
        type: "cost",
        priority: summary.returnRate > 10 ? "high" : "medium",
        title: "Снизьте возвраты",
        description: `${summary.returnRate}% заказов возвращаются`,
        impact: `Потенциальная экономия: ${round(costs.returns * 0.5).toLocaleString()} ₽`,
        actions: [
          "Улучшите качество фотографий",
          "Добавьте видео-обзоры",
          "Уточните размерные сетки",
        ],
      });
    }
    
    // По хранению
    if (costs.storage > summary.grossRevenue * 0.05) {
      recommendations.push({
        id: "rec_storage",
        type: "cost",
        priority: "medium",
        title: "Оптимизируйте хранение",
        description: `Затраты на хранение: ${costs.storage.toLocaleString()} ₽`,
        impact: `Экономия до ${round(costs.storage * 0.3).toLocaleString()} ₽`,
        actions: [
          "Сократите неликвидные позиции",
          "Оптимизируйте оборачиваемость",
          "Проведите распродажу застоявшихся товаров",
        ],
      });
    }
    
    // Из проблем
    for (const problem of problems.slice(0, 2)) {
      recommendations.push({
        id: `rec_${problem.type}`,
        type: "risk",
        priority: problem.severity === "critical" ? "high" : "medium",
        title: problem.title,
        description: problem.description,
        impact: `Потери: ${problem.potentialLoss.toLocaleString()} ₽`,
        actions: [problem.recommendation],
      });
    }
    
    return recommendations.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
  }
  
  // ===========================================================================
  // УТИЛИТЫ
  // ===========================================================================
  
  /** Получить строку с декодированием кириллицы (KOI-7) */
  private getDecodedString(value: any): string {
    if (value === null || value === undefined) return "";
    const str = getString(value);
    // Если файл был конвертирован через Python, данные уже декодированы из KOI-7
    // Не применяем повторное декодирование
    if (this.wasConverted) {
      return str;
    }
    // Если файл не был конвертирован, применяем декодирование KOI-7
    return fixEncoding(str);
  }
}

// =============================================================================
// ЭКСПОРТ
// =============================================================================

export async function analyzeReport(file: File | Buffer, fileName: string, costData?: Map<string, number>): Promise<AnalysisResult> {
  const analyzer = new OzonReportAnalyzer();
  return analyzer.analyze(file, fileName, costData);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number, showSign: boolean = false): string {
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDateRu(date: Date): string {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
