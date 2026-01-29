import type { DailyMetrics } from "@/lib/analysis/types";

export type TimeGranularity = "day" | "week" | "month";

export interface ProfitTrend {
  date: string;
  revenue: number;
  costs: number;
  profit: number;
  orders: number;
  totalCost?: number; // Себестоимость
  netProfit?: number; // Чистая прибыль (profit - totalCost)
}

/**
 * Группирует метрики по дням в выбранную градацию
 */
export function groupMetricsByGranularity(
  dailyMetrics: DailyMetrics[],
  granularity: TimeGranularity
): DailyMetrics[] {
  if (granularity === "day") {
    return dailyMetrics;
  }

  const grouped = new Map<string, DailyMetrics>();

  for (const metric of dailyMetrics) {
    const date = new Date(metric.date);
    let key: string;

    if (granularity === "week") {
      // Начало недели (понедельник)
      const weekStart = new Date(date);
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Понедельник = 1
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);
      key = weekStart.toISOString().split("T")[0];
    } else if (granularity === "month") {
      // Первый день месяца
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      key = monthStart.toISOString().split("T")[0];
    } else {
      key = metric.date;
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        date: key,
        ordersCount: 0,
        returnsCount: 0,
        revenue: 0,
        commission: 0,
        logistics: 0,
        returns: 0,
        netAmount: 0,
        pointsAmount: 0,
        totalCost: undefined,
        netProfit: undefined,
      });
    }

    const existing = grouped.get(key)!;
    existing.ordersCount += metric.ordersCount;
    existing.returnsCount += metric.returnsCount;
    existing.revenue += metric.revenue;
    existing.commission += metric.commission;
    existing.logistics += metric.logistics;
    existing.returns += metric.returns;
    existing.netAmount += metric.netAmount;
    existing.pointsAmount += metric.pointsAmount;
    
    // Себестоимость
    if (metric.totalCost !== undefined) {
      existing.totalCost = (existing.totalCost || 0) + metric.totalCost;
    }
  }
  
  // Пересчитываем чистую прибыль для сгруппированных данных
  for (const metric of grouped.values()) {
    if (metric.totalCost !== undefined && metric.totalCost > 0) {
      metric.netProfit = metric.netAmount - metric.totalCost;
    } else {
      metric.netProfit = undefined;
    }
  }

  return Array.from(grouped.values()).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * Фильтрует метрики по периоду
 */
export function filterMetricsByPeriod(
  dailyMetrics: DailyMetrics[],
  startDate: Date | null,
  endDate: Date | null
): DailyMetrics[] {
  if (!startDate && !endDate) {
    return dailyMetrics;
  }

  return dailyMetrics.filter((metric) => {
    const metricDate = new Date(metric.date);
    metricDate.setHours(0, 0, 0, 0);

    if (startDate && metricDate < startDate) {
      return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (metricDate > end) {
        return false;
      }
    }
    return true;
  });
}

export interface ProfitTrend {
  date: string;
  revenue: number;
  costs: number;
  profit: number;
  orders: number;
  totalCost?: number; // Себестоимость
  netProfit?: number; // Чистая прибыль (profit - totalCost)
}

/**
 * Преобразует DailyMetrics в ProfitTrend
 */
export function convertToProfitTrend(dailyMetrics: DailyMetrics[]): ProfitTrend[] {
  return dailyMetrics.map((day) => ({
    date: day.date,
    revenue: day.revenue,
    costs: day.commission + day.logistics + day.returns,
    profit: day.netAmount,
    orders: day.ordersCount,
    totalCost: day.totalCost,
    netProfit: day.netProfit,
  }));
}

/**
 * Форматирует дату для отображения в зависимости от градации
 */
export function formatDateForGranularity(date: string, granularity: TimeGranularity): string {
  const d = new Date(date);
  
  if (granularity === "day") {
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  } else if (granularity === "week") {
    const weekEnd = new Date(d);
    weekEnd.setDate(d.getDate() + 6);
    return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
  } else if (granularity === "month") {
    return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  
  return date;
}
