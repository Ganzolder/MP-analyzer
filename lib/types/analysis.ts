/**
 * Типы для модуля анализа
 * 
 * Реэкспорт из основного модуля анализатора
 */

import type { AnalysisResult as AnalyzerAnalysisResult } from "@/lib/analysis/types";

export type {
  RawRow,
  ProductMetrics,
  DailyMetrics,
  CostBreakdown,
  ProblemArea,
  Recommendation,
} from "@/lib/analysis/types";

// =============================================================================
// ДОПОЛНИТЕЛЬНЫЕ ТИПЫ ДЛЯ UI
// =============================================================================

/**
 * Данные о товаре в формате фронтенда (формируются в `transformToFrontendFormat`)
 * Используются в таблицах/графиках UI.
 */
export interface ProductData {
  sku: string;
  article?: string;
  name: string;

  revenue: number;
  /** Выплата (netAmount) */
  profit: number;
  /** Чистая прибыль с учётом себестоимости (если есть) */
  netProfit?: number;

  /** Маржа/маржинальность (в %) */
  margin: number;
  /** Рентабельность с учётом себестоимости (в %) */
  profitMargin?: number;

  orders: number;
  returnRate: number;
  cancellationRate?: number;

  // Для экспорта/расширенной аналитики
  totalSold?: number;
  totalReturned?: number;
  returnsCount?: number;
  totalCommission?: number;
  totalLogistics?: number;
  totalReturnsAmount?: number;
  costPerUnit?: number;
  totalCost?: number;
  hasCost?: boolean;
}

/** Причина отмен / возвратов (для диаграмм) */
export interface CancellationReason {
  reason: string;
  count: number;
  percent: number;
}

/** Причина возврата (по структуре идентична CancellationReason) */
export interface ReturnReason {
  reason: string;
  count: number;
  percent: number;
}

export type RecommendationCategory = "strategy" | "pricing" | "assortment" | "logistics" | "problems";
export type RecommendationPriority = "high" | "medium" | "low";

/**
 * Рекомендация для UI (может приходить как из анализатора, так и из AI)
 * Компонент `RecommendationsList` нормализует входные данные.
 */
export interface AIRecommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  expectedImpact?: string;
  impact?: string;
  actions?: string[];
  actionItems?: string[];
  /** Для совместимости со старыми форматами */
  type?: string;
}

/** Точка тренда прибыли (используется в графиках) */
export interface ProfitTrendPoint {
  date: string;
  revenue: number;
  costs: number;
  profit: number;
  orders: number;
  totalCost?: number;
  netProfit?: number;
}

/**
 * Результат анализа в формате фронтенда (после `transformToFrontendFormat`)
 * Отличается от AnalyzerAnalysisResult тем, что:
 * - `topProducts/worstProducts` в формате `ProductData[]`
 * - добавлены `profitTrends`, `lossProducts`, `cancellationReasons`, `returnReasons`
 */
export type FrontendAnalysisResult =
  Omit<AnalyzerAnalysisResult, "topProducts" | "worstProducts" | "recommendations"> & {
    topProducts: ProductData[];
    worstProducts: ProductData[];
    lossProducts?: ProductData[];
    profitTrends?: ProfitTrendPoint[];
    cancellationReasons?: CancellationReason[];
    returnReasons?: ReturnReason[];
    recommendations: unknown[];
  };

/** Статус шага анализа */
export type StepStatus = "pending" | "in_progress" | "completed" | "error";

/** Шаг процесса анализа */
export interface AnalysisStep {
  id: string;
  name: string;
  description: string;
  status: StepStatus;
  progress?: number;
}

/** Состояние прогресса анализа */
export interface AnalysisProgress {
  currentStep: number;
  totalSteps: number;
  percent: number;
  steps: AnalysisStep[];
  error?: string;
}

/** Фильтры для таблицы товаров */
export interface ProductFilters {
  search?: string;
  category?: string;
  minMargin?: number;
  maxMargin?: number;
  sortBy?: "revenue" | "margin" | "quantity" | "returns";
  sortOrder?: "asc" | "desc";
}

/** Настройки экспорта */
export interface ExportOptions {
  format: "xlsx" | "pdf" | "csv";
  includeCharts?: boolean;
  includeTables?: boolean;
  includeRecommendations?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/** Период для фильтрации */
export type DatePeriod = "week" | "month" | "quarter" | "year" | "custom";

/** Тип метрики для отображения */
export type MetricType = 
  | "revenue" 
  | "profit" 
  | "margin" 
  | "orders" 
  | "returns" 
  | "commission" 
  | "logistics";

/** Конфигурация графика */
export interface ChartConfig {
  type: "line" | "bar" | "pie" | "area";
  title: string;
  dataKey: string;
  color?: string;
  showLegend?: boolean;
  showGrid?: boolean;
}
