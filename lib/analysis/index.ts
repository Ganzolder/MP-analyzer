/**
 * Модуль анализа — публичный API.
 *
 * Новый пайплайн: один вход consolidateAndAnalyze() + адаптер toFrontendAnalysis().
 * Старые модули (analyzer.ts, merge-results.ts, aggregators/, calculators/, analyzers/)
 * полностью удалены — их заменяет pipeline/.
 */

export { consolidateAndAnalyze } from "./pipeline";
export type { ConsolidationResult, ConsolidateInput, SourceFile, ConsolidationAnalytics } from "./pipeline";
export { toFrontendAnalysis } from "./pipeline/to-frontend";

export type {
  ChargeLine,
  Order,
  Shipment,
  OrderItem,
  ConsolidatedReport,
  ProductAggregate,
  DailyMetricPoint,
  OrderClassification,
} from "./domain";

export type { ChargeCategory } from "./charge-types";
export { classifyChargeType } from "./charge-types";
export { extractOrderKey, extractShipmentSuffix, isSubscriptionCharge } from "./keys";
export { getProductAggregateKey } from "./product-key";
export { getOrderNetProfitForDisplay } from "./order-net-profit";

// Легаси-типы для UI (components ссылаются на них). Шим.
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
