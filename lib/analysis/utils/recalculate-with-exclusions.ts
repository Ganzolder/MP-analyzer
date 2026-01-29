/**
 * Утилита для пересчёта анализа с исключением указанных артикулов
 */

import type { FrontendAnalysisResult, ProductData } from "@/lib/types/analysis";
import type { AggregatedOrder } from "@/lib/analysis/types";

/**
 * Пересчитывает результаты анализа, исключая указанные артикулы (SKU)
 * 
 * @param originalData - Исходные данные анализа
 * @param excludedSkus - Массив SKU для исключения
 * @returns Пересчитанные данные анализа
 */
export function recalculateWithExclusions(
  originalData: FrontendAnalysisResult,
  excludedSkus: string[]
): FrontendAnalysisResult {
  if (excludedSkus.length === 0) {
    return originalData;
  }

  const excludedSet = new Set(excludedSkus);

  // 1. Фильтруем товары
  const filteredProducts = (originalData.topProducts || []).filter(
    (p) => !excludedSet.has(p.sku)
  );

  // 2. Фильтруем заказы (исключаем заказы с указанными SKU)
  const filteredOrders = (originalData.orders || []).filter(
    (order) => !excludedSet.has(order.sku)
  );

  // 3. Пересчитываем summary
  const recalculatedSummary = {
    ...originalData.summary,
    grossRevenue: filteredOrders.reduce((sum, o) => sum + (o.grossRevenue || 0), 0),
    revenueAmount: filteredOrders.reduce((sum, o) => sum + (o.revenueAmount || 0), 0),
    pointsAmount: filteredOrders.reduce((sum, o) => sum + (o.pointsAmount || 0), 0),
    netPayout: filteredOrders.reduce((sum, o) => sum + (o.totalAmountRub || 0), 0),
    totalOrders: filteredOrders.length,
    completedOrders: filteredOrders.filter((o) => o.status === "completed").length,
    returnedOrders: filteredOrders.filter((o) => o.status === "returned").length,
    partialReturns: filteredOrders.filter((o) => o.status === "partial_return").length,
    cancelledOrders: filteredOrders.filter((o) => o.status === "cancelled").length,
    totalCost: filteredOrders.reduce((sum, o) => sum + ((o as any).totalCost || 0), 0),
    totalCostSold: filteredOrders.reduce((sum, o) => {
      if ((o as any).totalCost && o.status === "completed") {
        return sum + ((o as any).totalCost || 0);
      }
      return sum;
    }, 0),
    totalNetProfit: filteredOrders.reduce((sum, o) => {
      const revenue = o.grossRevenue || 0;
      const cost = (o as any).totalCost || 0;
      const payout = o.totalAmountRub || 0;
      return sum + (payout - cost);
    }, 0),
  };

  // Пересчитываем удержания Ozon
  const ozonFees = filteredOrders.reduce((sum, o) => {
    return (
      sum +
      (o.commissionAmount || 0) +
      (o.logisticsAmount || 0) +
      (o.acquiringAmount || 0) +
      (o.returnAmount || 0) +
      (o.otherFeesAmount || 0)
    );
  }, 0);

  recalculatedSummary.ozonFees = ozonFees;

  // 4. Пересчитываем costBreakdown (если есть)
  const recalculatedCostBreakdown = originalData.costBreakdown
    ? {
        ...originalData.costBreakdown,
        // Фильтруем элементы costBreakdown, которые относятся к исключённым товарам
        // Это зависит от структуры costBreakdown
      }
    : undefined;

  // 5. Пересчитываем dailyMetrics (фильтруем по заказам)
  const recalculatedDailyMetrics = (originalData.dailyMetrics || []).map((dm) => {
    // Фильтруем заказы этого дня
    const dayOrders = filteredOrders.filter((o) => {
      const orderDate = new Date((o as any).chargeDate || (o as any).orderDate || (o as any).createdAt || 0);
      const metricDate = new Date(dm.date);
      return (
        orderDate.getFullYear() === metricDate.getFullYear() &&
        orderDate.getMonth() === metricDate.getMonth() &&
        orderDate.getDate() === metricDate.getDate()
      );
    });

    return {
      ...dm,
      revenue: dayOrders.reduce((sum, o) => sum + (o.revenueAmount || o.grossRevenue || 0), 0),
      netAmount: dayOrders.reduce((sum, o) => sum + (o.totalAmountRub || 0), 0),
      ordersCount: dayOrders.length,
      returnsCount: dayOrders.filter((o) => o.status === "returned" || o.status === "partial_return").length,
      commission: dayOrders.reduce((sum, o) => sum + (o.commissionAmount || 0), 0),
      logistics: dayOrders.reduce((sum, o) => sum + ((o.logisticsAmount || 0) + (o.acquiringAmount || 0)), 0),
      returns: dayOrders.reduce((sum, o) => sum + (o.returnAmount || 0), 0),
      pointsAmount: dayOrders.reduce((sum, o) => sum + (o.pointsAmount || 0), 0),
      totalCost: dayOrders.reduce((sum, o) => sum + ((o as any).totalCost || 0), 0),
    };
  });

  // 6. Пересчитываем profitTrends
  const recalculatedProfitTrends = recalculatedDailyMetrics.map((dm) => ({
    date: dm.date,
    revenue: dm.revenue || 0,
    costs: dm.totalCost || 0,
    profit: (dm.netAmount || 0) - (dm.totalCost || 0),
    orders: dm.ordersCount || 0,
  }));

  // 7. Пересчитываем chargeTypeBreakdown (если есть)
  // Это сложнее, так как нужно пересчитать по типам начислений из отфильтрованных заказов
  const recalculatedChargeTypeBreakdown = originalData.chargeTypeBreakdown
    ? recalculateChargeTypeBreakdown(filteredOrders, originalData.chargeTypeBreakdown)
    : undefined;

  const result: FrontendAnalysisResult = {
    ...originalData,
    topProducts: filteredProducts,
    orders: filteredOrders,
    summary: recalculatedSummary,
    dailyMetrics: recalculatedDailyMetrics,
    profitTrends: recalculatedProfitTrends,
  };

  // Добавляем опциональные поля только если они есть
  if (recalculatedCostBreakdown) {
    result.costBreakdown = recalculatedCostBreakdown;
  }
  if (recalculatedChargeTypeBreakdown) {
    result.chargeTypeBreakdown = recalculatedChargeTypeBreakdown;
  }

  return result;
}

/**
 * Пересчитывает chargeTypeBreakdown на основе отфильтрованных заказов
 */
function recalculateChargeTypeBreakdown(
  filteredOrders: AggregatedOrder[],
  originalBreakdown: any
): any {
  // Создаём новый breakdown на основе отфильтрованных заказов
  const breakdownMap = new Map<string, { amount: number; count: number }>();

  for (const order of filteredOrders) {
    if (order.chargeTypes && Array.isArray(order.chargeTypes)) {
      for (const chargeType of order.chargeTypes) {
        const existing = breakdownMap.get(chargeType) || { amount: 0, count: 0 };
        
        // Суммируем суммы по типам начислений из заказа
        // Это упрощённая версия - в реальности нужно учитывать все типы начислений
        let amount = 0;
        if (chargeType.includes("Комиссия")) {
          amount = order.commissionAmount || 0;
        } else if (chargeType.includes("Логистика")) {
          amount = (order.logisticsAmount || 0) + (order.acquiringAmount || 0);
        } else if (chargeType.includes("Возврат")) {
          amount = order.returnAmount || 0;
        } else {
          amount = order.otherFeesAmount || 0;
        }

        breakdownMap.set(chargeType, {
          amount: existing.amount + amount,
          count: existing.count + 1,
        });
      }
    }
  }

  // Преобразуем в формат chargeTypeBreakdown
  const result: any[] = [];
  for (const [chargeType, data] of breakdownMap.entries()) {
    result.push({
      name: chargeType,
      amount: data.amount,
      count: data.count,
    });
  }

  return result;
}
