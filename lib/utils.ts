import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Объединяет классы с помощью clsx и оптимизирует Tailwind классы
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Форматирование денежных сумм
 */
export function formatCurrency(
  value: number,
  currency: string = "RUB",
  locale: string = "ru-RU"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Форматирование чисел с разделителями
 */
export function formatNumber(
  value: number,
  locale: string = "ru-RU"
): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Форматирование процентов
 */
export function formatPercent(
  value: number,
  decimals: number = 1
): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/**
 * Форматирование размера файла
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Б";
  const k = 1024;
  const sizes = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Форматирование даты
 */
export function formatDate(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  }
): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ru-RU", options);
}

/**
 * Форматирование даты и времени
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Сокращение текста
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Генерация уникального ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Задержка выполнения
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce функция
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Получение цвета на основе значения (положительное/отрицательное)
 */
export function getValueColor(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

/**
 * Безопасный парсинг JSON
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Проверка допустимых форматов файлов
 */
export function isValidFileType(
  file: File,
  acceptedTypes: string[]
): boolean {
  const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  return acceptedTypes.some(
    (type) =>
      type === file.type ||
      type === fileExtension ||
      (type.endsWith("/*") && file.type.startsWith(type.slice(0, -2)))
  );
}

/**
 * Haptic feedback для мобильных устройств
 */
export function hapticFeedback(type: "light" | "medium" | "heavy" = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const duration = type === "light" ? 10 : type === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
}
