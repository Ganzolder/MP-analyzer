/**
 * Утилиты для работы с данными: парсинг, форматирование, преобразование
 */

/**
 * Получить строку (без декодирования)
 */
export function getString(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Получить число из строки или числа
 */
export function getNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  
  return parseFloat(cleaned) || 0;
}

/**
 * Парсинг даты из различных форматов
 */
export function parseDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000);
  }
  
  if (typeof value === "string") {
    // DD.MM.YYYY или DD.MM.YY
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
    if (match) {
      let [, d, m, y] = match;
      if (y.length === 2) y = "20" + y;
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    }
    
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return new Date();
}

/**
 * Форматирование даты в ISO формат (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Округление числа
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Генерация уникального ID
 */
export function generateId(): string {
  return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Форматирование валюты
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Форматирование процентов
 */
export function formatPercent(value: number, showSign: boolean = false): string {
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Форматирование даты в русском формате
 */
export function formatDateRu(date: Date): string {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
