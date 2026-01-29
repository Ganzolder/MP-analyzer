/**
 * Модуль анализа - публичный API
 */

export {
  // Основной класс
  OzonReportAnalyzer,
  
  // Функции
  analyzeReport,
  formatCurrency,
  formatPercent,
  formatDateRu,
} from "./analyzer";

// Типы экспортируем из отдельного модуля
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

// Конвертер (экспортируем отдельно)
export { convertXlsxToXls } from "./converter";

// Утилиты объединения результатов
export { mergeAnalysisResults } from "./merge-results";
