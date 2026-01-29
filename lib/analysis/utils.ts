/**
 * Утилиты для преобразования данных анализа
 */

import type { AnalysisResult } from "./types";

/**
 * Формат данных для UI компонентов (совместимость со старым форматом)
 */
export interface UIAnalysisResult {
  id: string;
  fileName: string;
  fileSize: number;
  
  summary: {
    // Новые поля
    grossRevenue: number;
    revenueAmount: number;
    pointsAmount: number;
    ozonFees: number;
    netPayout: number;
    feesPercent: number;
    
    // Для совместимости со старым UI
    totalRevenue: number;
    netProfit: number;
    marginPercent: number;
    averageOrderValue: number;
    cancellationRate: number;
    roi: number;
    
    // Общие
    totalOrders: number;
    completedOrders: number;
    returnedOrders: number;
    partialReturns: number;
    totalProducts: number;
    avgOrderValue: number;
    avgCommissionPercent: number;
    returnRate: number;
    
    periodStart: Date;
    periodEnd: Date;
  };
  
  // Данные для графиков
  profitTrends: Array<{
    date: string;
    revenue: number;
    costs: number;
    profit: number;
  }>;
  
  costBreakdown: Array<{
    category: string;
    amount: number;
    percent: number;
    color: string;
  }>;
  
  topProducts: Array<{
    sku: string;
    name: string;
    revenue: number;
    profit: number;
    margin: number;
    orders: number;
    returnRate: number;
  }>;
  
  lossProducts: Array<{
    sku: string;
    name: string;
    revenue: number;
    profit: number;
    margin: number;
    orders: number;
    returnRate: number;
    cancellationRate: number;
  }>;
  
  cancellationReasons: Array<{
    reason: string;
    count: number;
    percent: number;
  }>;
  
  returnReasons: Array<{
    reason: string;
    count: number;
    percent: number;
  }>;
  
  recommendations: Array<{
    id: string;
    type: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    impact: string;
    actionItems: string[];
  }>;
  
  // Оригинальные данные
  orders: AnalysisResult["orders"];
  nonOrderCharges: AnalysisResult["nonOrderCharges"];
  subscriptions: AnalysisResult["subscriptions"];
}

/**
 * Цвета для категорий затрат
 */
const COST_COLORS: Record<string, string> = {
  commission: "#ef4444",    // red
  logistics: "#f97316",     // orange
  returns: "#eab308",       // yellow
  storage: "#22c55e",       // green
  advertising: "#3b82f6",   // blue
  subscriptions: "#8b5cf6", // violet
  penalties: "#ec4899",     // pink
  other: "#6b7280",         // gray
};

/**
 * Названия категорий затрат
 */
const COST_NAMES: Record<string, string> = {
  commission: "Комиссия Ozon",
  logistics: "Логистика",
  returns: "Возвраты",
  storage: "Хранение",
  advertising: "Реклама",
  subscriptions: "Подписки",
  penalties: "Штрафы",
  other: "Прочее",
};

/**
 * Преобразует результат анализа в формат для UI
 */
export function transformToUIFormat(
  result: AnalysisResult,
  id: string,
  fileName: string,
  fileSize: number
): UIAnalysisResult {
  const { summary, costBreakdown, dailyMetrics, productMetrics, orders, nonOrderCharges, subscriptions, recommendations } = result;
  
  // Преобразуем дневные метрики в тренды
  const profitTrends = dailyMetrics.map(d => ({
    date: formatDateShort(d.date),
    revenue: d.revenue,
    costs: d.commission + d.logistics,
    profit: d.revenue - d.commission - d.logistics,
  }));
  
  // Преобразуем структуру затрат
  const costBreakdownUI = Object.entries(costBreakdown)
    .filter(([key]) => key !== "total")
    .map(([key, amount]) => ({
      category: COST_NAMES[key] || key,
      amount: amount as number,
      percent: summary.ozonFees > 0 ? Math.round((amount as number) / summary.ozonFees * 100) : 0,
      color: COST_COLORS[key] || "#6b7280",
    }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  
  // Преобразуем метрики товаров
  const topProducts = productMetrics
    .filter(p => p.netAmount >= 0)
    .slice(0, 10)
    .map(p => ({
      sku: p.sku,
      name: p.productName,
      revenue: p.totalRevenue,
      profit: p.netAmount,
      margin: p.marginPercent,
      orders: p.ordersCount,
      returnRate: p.returnRate,
    }));
  
  const lossProducts = productMetrics
    .filter(p => p.netAmount < 0)
    .slice(0, 5)
    .map(p => ({
      sku: p.sku,
      name: p.productName,
      revenue: p.totalRevenue,
      profit: p.netAmount,
      margin: p.marginPercent,
      orders: p.ordersCount,
      returnRate: p.returnRate,
      cancellationRate: 0,
    }));
  
  // Причины возвратов (из заказов со статусом returned)
  const returnReasonCounts = new Map<string, number>();
  orders.filter(o => o.status === "returned").forEach(o => {
    o.chargeTypes.forEach(type => {
      if (type.includes("Возврат") || type.includes("возврат")) {
        returnReasonCounts.set(type, (returnReasonCounts.get(type) || 0) + 1);
      }
    });
  });
  
  const totalReturns = summary.returnedOrders || 1;
  const returnReasons = Array.from(returnReasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percent: Math.round(count / totalReturns * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  // Если нет данных по причинам, добавим заглушку
  if (returnReasons.length === 0 && summary.returnedOrders > 0) {
    returnReasons.push({
      reason: "Не указана",
      count: summary.returnedOrders,
      percent: 100,
    });
  }
  
  // Преобразуем рекомендации
  const recommendationsUI = recommendations.map(r => ({
    id: r.id,
    type: r.type,
    priority: r.priority,
    title: r.title,
    description: r.description,
    impact: r.impact,
    actionItems: r.actions,
  }));
  
  return {
    id,
    fileName,
    fileSize,
    
    summary: {
      // Новые поля
      grossRevenue: summary.grossRevenue,
      revenueAmount: summary.revenueAmount,
      pointsAmount: summary.pointsAmount,
      ozonFees: summary.ozonFees,
      netPayout: summary.netPayout,
      feesPercent: summary.feesPercent,
      
      // Для совместимости
      totalRevenue: summary.grossRevenue,
      netProfit: summary.netPayout,
      marginPercent: 100 - summary.feesPercent, // "остаётся на руках" %
      averageOrderValue: summary.avgOrderValue,
      cancellationRate: 0, // Нет данных по отменам в текущем формате
      roi: summary.grossRevenue > 0 ? (summary.netPayout / summary.grossRevenue) * 100 : 0,
      
      // Общие
      totalOrders: summary.totalOrders,
      completedOrders: summary.completedOrders,
      returnedOrders: summary.returnedOrders,
      partialReturns: summary.partialReturns,
      totalProducts: summary.totalProducts,
      avgOrderValue: summary.avgOrderValue,
      avgCommissionPercent: summary.avgCommissionPercent,
      returnRate: summary.returnRate,
      
      periodStart: result.period.start,
      periodEnd: result.period.end,
    },
    
    profitTrends,
    costBreakdown: costBreakdownUI,
    topProducts,
    lossProducts,
    cancellationReasons: [], // Нет данных по отменам
    returnReasons,
    recommendations: recommendationsUI,
    
    orders,
    nonOrderCharges,
    subscriptions,
  };
}

/**
 * Форматирует дату в короткий формат
 */
function formatDateShort(date: string): string {
  try {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  } catch {
    return date;
  }
}
