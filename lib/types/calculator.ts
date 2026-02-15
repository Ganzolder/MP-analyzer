/**
 * Типы для калькулятора оптимальных цен
 */

export type Marketplace = "ozon" | "wildberries" | "yandex-market";

/**
 * Данные товара из файла для Озона
 */
export interface OzonProductData {
  category: string;              // Категория товара (обязательное)
  article: string;               // Артикул (обязательное)
  name: string;                  // Наименование (обязательное)
  cost: number;                  // Себестоимость (обязательное)
  marginPercent?: number;        // Маржинальность в % (необязательное)
  width: number;                 // Ширина в мм (0 если не указано)
  height: number;                // Высота в мм (0 если не указано)
  length: number;                // Длина в мм (0 если не указано)
  weight?: number;               // Вес в граммах (необязательное)
  volumeLiters: number;          // Объём в литрах (расчётный или прямой)
}

/**
 * Настройки маржинальности
 */
export interface MarginSettings {
  global: number;                // Общая маржинальность (%)
  byCategory: Record<string, number>; // Маржинальность по категориям (%)
}

/**
 * Результат парсинга файла
 */
export interface ParsedFileResult {
  products: OzonProductData[];
  categories: string[];          // Уникальные категории из файла
  errors: string[];              // Ошибки парсинга
}

/**
 * Настройки калькулятора Озона
 */
export interface OzonCalculatorSettings {
  marginSettings: MarginSettings;
  file: File | null;
  parsedData: ParsedFileResult | null;
}

/**
 * Общие настройки калькулятора
 */
export interface CalculatorState {
  marketplace: Marketplace;
  ozon: OzonCalculatorSettings;
}

// ─── Типы массового расчёта ────────────────────────────────────

/**
 * Результат расчёта для одного типа отгрузки (массовый расчёт)
 */
export interface BulkCalcFulfillment {
  recommendedPrice: number;
  commissionPct: number;
  commissionAmount: number;
  shippingCost: number;
  dispatchFee: number;
  deliveryToPickup: number;
  acquiringFee: number;
  totalFees: number;
  profit: number;
  marginPct: number; // от цены продажи
}

/**
 * Полный результат расчёта одного товара (массовый расчёт)
 */
export interface BulkCalcResult {
  article: string;
  name: string;
  category: string;
  cost: number;
  volumeLiters: number;
  targetMargin: number;
  fbo: BulkCalcFulfillment;
  fbs: BulkCalcFulfillment;
  rfbs: BulkCalcFulfillment;
  error?: string;
}
