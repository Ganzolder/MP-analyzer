/**
 * Централизованная система логирования для анализатора
 * Выводит подробные логи в консоль браузера с форматированием
 */

type LogLevel = "info" | "warn" | "error" | "debug" | "success";

interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  timestamp: Date;
}

class Logger {
  private logs: LogEntry[] = [];
  private enabled = true;
  private minLevel: LogLevel = "debug";

  constructor() {
    // В production можно отключить детальные логи
    if (process.env.NODE_ENV === "production") {
      this.minLevel = "warn";
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    
    const levels: LogLevel[] = ["debug", "info", "success", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(entry: LogEntry): string {
    const time = entry.timestamp.toLocaleTimeString("ru-RU", { 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit",
      fractionalSecondDigits: 3
    });
    
    const category = `[${entry.category}]`;
    const prefix = `${time} ${category}`;
    
    return prefix;
  }

  private getStyle(level: LogLevel): string {
    const styles: Record<LogLevel, string> = {
      debug: "color: #888; font-weight: normal",
      info: "color: #2196F3; font-weight: normal",
      success: "color: #4CAF50; font-weight: bold",
      warn: "color: #FF9800; font-weight: bold",
      error: "color: #F44336; font-weight: bold",
    };
    return styles[level];
  }

  private log(level: LogLevel, category: string, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      category,
      message,
      data,
      timestamp: new Date(),
    };

    this.logs.push(entry);

    const formattedMsg = this.formatMessage(entry);
    const icon = this.getIcon(level);
    const isServer = typeof window === "undefined";

    // Выводим в консоль
    if (isServer) {
      // На сервере (Node.js) - простой текст без CSS-стилей
      const logMessage = `${icon} ${formattedMsg} ${message}`;
      if (data !== undefined) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    } else {
      // В браузере - с CSS-стилями
      const style = this.getStyle(level);
      if (data !== undefined) {
        console.log(
          `%c${icon} ${formattedMsg} ${message}`,
          style,
          data
        );
      } else {
        console.log(
          `%c${icon} ${formattedMsg} ${message}`,
          style
        );
      }
    }
  }

  private getIcon(level: LogLevel): string {
    const icons = {
      debug: "🔍",
      info: "ℹ️",
      success: "✅",
      warn: "⚠️",
      error: "❌",
    };
    return icons[level];
  }

  // Публичные методы
  debug(category: string, message: string, data?: any): void {
    this.log("debug", category, message, data);
  }

  info(category: string, message: string, data?: any): void {
    this.log("info", category, message, data);
  }

  success(category: string, message: string, data?: any): void {
    this.log("success", category, message, data);
  }

  warn(category: string, message: string, data?: any): void {
    this.log("warn", category, message, data);
  }

  error(category: string, message: string, error?: any): void {
    if (error instanceof Error) {
      this.log("error", category, `${message}: ${error.message}`, {
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.log("error", category, message, error);
    }
  }

  // Специальные методы для анализатора
  startAnalysis(fileName: string, fileSize: number): void {
    this.info("Analysis", "Начало анализа файла", { fileName, fileSize });
  }

  fileConverted(originalSize: number, convertedSize: number): void {
    this.success("Converter", "XLSX → XLS конвертация завершена", {
      originalSize: `${(originalSize / 1024 / 1024).toFixed(2)} MB`,
      convertedSize: `${(convertedSize / 1024 / 1024).toFixed(2)} MB`,
    });
  }

  fileParsed(rowCount: number, wasConverted: boolean): void {
    this.success("Parser", "Файл распарсен", {
      rowCount,
      wasConverted,
      source: wasConverted ? "XLS (конвертирован)" : "Оригинальный файл",
    });
  }

  decodingSample(samples: Array<{ raw: string; decoded: string }>): void {
    this.debug("Decoder", "Примеры декодирования KOI-7", {
      samples: samples.slice(0, 5),
      total: samples.length,
    });
  }

  ordersAggregated(count: number): void {
    this.success("Aggregator", "Заказы агрегированы", { count });
  }

  productsCalculated(total: number, withNames: number, withoutNames: number): void {
    this.success("Products", "Метрики товаров рассчитаны", {
      total,
      withNames,
      withoutNames,
      percentageWithNames: total > 0 ? `${((withNames / total) * 100).toFixed(1)}%` : "0%",
    });
  }

  topProducts(top5: Array<{ name: string; revenue: number; profit: number }>): void {
    this.info("Products", "Топ-5 товаров по прибыли", { top5 });
  }

  summaryCalculated(summary: {
    grossRevenue: number;
    netPayout: number;
    totalOrders: number;
  }): void {
    this.success("Summary", "Сводка рассчитана", {
      grossRevenue: `${summary.grossRevenue.toLocaleString("ru-RU")} ₽`,
      netPayout: `${summary.netPayout.toLocaleString("ru-RU")} ₽`,
      totalOrders: summary.totalOrders,
    });
  }

  analysisComplete(duration: number): void {
    this.success("Analysis", `Анализ завершён за ${duration.toFixed(2)} сек`, {
      logs: this.logs.length,
    });
  }

  // Получить все логи
  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Очистить логи
  clear(): void {
    this.logs = [];
  }

  // Экспортировать логи в JSON
  exportLogs(): string {
    return JSON.stringify(
      this.logs.map(log => ({
        ...log,
        timestamp: log.timestamp.toISOString(),
      })),
      null,
      2
    );
  }
}

// Создаём глобальный экземпляр
export const logger = new Logger();

// В браузере делаем logger доступным через window для отладки
if (typeof window !== "undefined") {
  (window as any).logger = logger;
  (window as any).exportLogs = () => {
    const logs = logger.exportLogs();
    console.log("=== ЭКСПОРТ ЛОГОВ ===");
    console.log(logs);
    return logs;
  };
}

// Экспортируем для использования
export default logger;
