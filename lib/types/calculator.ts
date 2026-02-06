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
  width: number;                // Ширина в мм (обязательное)
  height: number;               // Высота в мм (обязательное)
  length: number;               // Длина в мм (обязательное)
  weight?: number;              // Вес в граммах (необязательное)
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
  // wildberries: WildberriesCalculatorSettings; // Будет добавлено позже
  // yandexMarket: YandexMarketCalculatorSettings; // Будет добавлено позже
}
