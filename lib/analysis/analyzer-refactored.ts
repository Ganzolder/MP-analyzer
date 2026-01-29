/**
 * Модуль анализа финансовых отчётов Ozon (рефакторинг)
 * 
 * Координатор, использующий специализированные модули
 */

import { logger } from "@/lib/utils/logger";
import { generateId } from "./data-utils";
import { FileParser } from "./parsers/file-parser";
import { OrderAggregator } from "./aggregators/order-aggregator";
import { NonOrderAggregator } from "./aggregators/non-order-aggregator";
import { ProductMetricsCalculator } from "./calculators/product-metrics-calculator";
import { CostCalculator } from "./calculators/cost-calculator";
import { SummaryCalculator } from "./calculators/summary-calculator";
import { DailyMetricsCalculator } from "./calculators/daily-metrics-calculator";
import { SchemeStatsCalculator } from "./calculators/scheme-stats-calculator";
import { ChargeTypeBreakdownCalculator } from "./calculators/charge-type-breakdown-calculator";
import { CostReportsCalculator } from "./calculators/cost-reports-calculator";
import { ProblemIdentifier } from "./analyzers/problem-identifier";
import { RecommendationGenerator } from "./analyzers/recommendation-generator";
import { TopProductsHelper } from "./utils/top-products";
import type {
  AnalysisResult,
  ChargeRow,
} from "./types";

// Реэкспортируем типы
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

export class OzonReportAnalyzer {
  private fileParser = new FileParser();
  private orderAggregator = new OrderAggregator();
  private nonOrderAggregator = new NonOrderAggregator();
  private productMetricsCalculator = new ProductMetricsCalculator();
  private costCalculator = new CostCalculator();
  private summaryCalculator = new SummaryCalculator();
  private dailyMetricsCalculator = new DailyMetricsCalculator();
  private schemeStatsCalculator = new SchemeStatsCalculator();
  private chargeTypeBreakdownCalculator = new ChargeTypeBreakdownCalculator();
  private costReportsCalculator = new CostReportsCalculator();
  private problemIdentifier = new ProblemIdentifier();
  private recommendationGenerator = new RecommendationGenerator();
  private topProductsHelper = new TopProductsHelper();

  /**
   * Анализирует файл отчёта
   */
  async analyze(
    file: File | Buffer,
    fileName: string,
    costData?: Map<string, number>
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    const fileSize = file instanceof Buffer
      ? file.length
      : (await (file as File).arrayBuffer()).byteLength;

    console.log("📊 [Analyzer] Начало анализа:", fileName, `(${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    logger.startAnalysis(fileName, fileSize);

    // 1. Парсинг файла
    const parseResult = await this.fileParser.parseFile(file, fileName);
    console.log("📄 [Analyzer] Файл распарсен. Строк:", parseResult.chargeRows.length);

    // 2. Агрегация заказов
    const orders = this.orderAggregator.aggregateOrders(parseResult.chargeRows);
    console.log("📦 [Analyzer] Заказы агрегированы. Всего заказов:", orders.length);

    // 3. Добавляем себестоимость к заказам
    const { articlesComparison } = this.costCalculator.addCostToOrders(orders, costData);

    // 4. Обработка начислений без заказов и подписок
    const nonOrderCharges = this.nonOrderAggregator.aggregateNonOrderCharges(parseResult.chargeRows);
    const subscriptions = this.nonOrderAggregator.extractSubscriptions(parseResult.chargeRows);

    // 5. Расчёт метрик по товарам
    const productMetrics = this.productMetricsCalculator.calculateProductMetrics(orders, costData);
    console.log("📈 [Analyzer] Метрики товаров рассчитаны. Всего товаров:", productMetrics.length);
    const withNames = productMetrics.filter(p => p.productName && p.productName.trim()).length;
    console.log("   Товаров с названиями:", withNames, `(${withNames > 0 ? ((withNames / productMetrics.length) * 100).toFixed(1) : 0}%)`);

    // 6. Расчёт сводки и затрат
    const summary = this.summaryCalculator.calculateSummary(orders, nonOrderCharges, subscriptions, productMetrics);
    const costBreakdown = this.summaryCalculator.calculateCostBreakdown(orders, nonOrderCharges, subscriptions);

    // 7. Метрики по дням
    const dailyMetrics = this.dailyMetricsCalculator.calculateDailyMetrics(orders);

    // 8. Топы и проблемные товары
    const topProducts = this.topProductsHelper.getTopProducts(productMetrics);
    const worstProducts = this.topProductsHelper.getWorstProducts(productMetrics, Number.MAX_SAFE_INTEGER);
    const topOrders = this.topProductsHelper.getTopOrders(orders, 10);
    const returnedOrders = orders.filter(o => o.status === "returned" || o.status === "partial_return");

    console.log("🏆 [Analyzer] Топ-10 товаров:", topProducts.length);
    if (topProducts.length > 0) {
      console.log("   Первый товар:", topProducts[0].productName || "[БЕЗ НАЗВАНИЯ]", "SKU:", topProducts[0].sku);
    }

    // 9. Проблемные зоны и рекомендации
    const problemAreas = this.problemIdentifier.identifyProblemAreas(orders, productMetrics, costBreakdown);
    const recommendations = await this.recommendationGenerator.generateRecommendations(
      summary,
      costBreakdown,
      problemAreas
    );

    // 10. Статистика по схемам
    const schemeStats = this.schemeStatsCalculator.calculateSchemeStats(orders);

    // 11. Детализация по типам начислений
    const chargeTypeBreakdown = this.chargeTypeBreakdownCalculator.calculateChargeTypeBreakdown(parseResult.chargeRows);

    // 12. Отчёты по себестоимости
    const costReports = this.costReportsCalculator.generateCostReports(orders, productMetrics, articlesComparison);

    if (costReports && costReports.articlesComparison) {
      console.log("✅ [Analyzer] articlesComparison сохранён в costReports:");
      console.log(`   Артикулов из себестоимости: ${costReports.articlesComparison.costArticles.length}`);
      console.log(`   Артикулов из заказов: ${costReports.articlesComparison.orderArticles.length}`);
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
      fileName: fileName,
      analyzedAt: new Date(),
      period: {
        start: parseResult.periodStart,
        end: parseResult.periodEnd,
        label: parseResult.periodLabel,
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
}

// Экспортируем функции для обратной совместимости
export async function analyzeReport(
  file: File | Buffer,
  fileName: string,
  costData?: Map<string, number>
): Promise<AnalysisResult> {
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
