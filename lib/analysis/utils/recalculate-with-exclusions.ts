/**
 * Утилита для пересчёта анализа с исключением указанных артикулов
 */

import type { FrontendAnalysisResult, ProductData } from "@/lib/types/analysis";
import type { AggregatedOrder } from "@/lib/analysis/types";
import { getChargeGroup } from "../charge-type-groups";
import { getChargeCategory } from "../constants";

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

  // 7. Пересчитываем chargeTypeBreakdown на основе отфильтрованных заказов
  // Используем виртуальные chargeRows для правильного пересчёта
  const recalculatedChargeTypeBreakdown = recalculateChargeTypeBreakdown(filteredOrders);

  const result: FrontendAnalysisResult = {
    ...originalData,
    topProducts: filteredProducts || [],
    orders: filteredOrders || [],
    summary: recalculatedSummary,
    dailyMetrics: recalculatedDailyMetrics || [],
    profitTrends: recalculatedProfitTrends || [],
    // Убеждаемся, что все массивы инициализированы
    worstProducts: (originalData.worstProducts || []).filter(
      (p) => !excludedSet.has(p.sku)
    ),
    returnedOrders: (originalData.returnedOrders || []).filter(
      (order) => !excludedSet.has(order.sku)
    ),
    topOrders: (originalData.topOrders || []).filter(
      (order) => !excludedSet.has(order.sku)
    ),
  };

  // Добавляем опциональные поля только если они есть
  if (recalculatedCostBreakdown) {
    result.costBreakdown = recalculatedCostBreakdown;
  }
  // Всегда устанавливаем chargeTypeBreakdown (даже если пустой массив)
  result.chargeTypeBreakdown = recalculatedChargeTypeBreakdown || [];

  return result;
}

/**
 * Пересчитывает chargeTypeBreakdown на основе отфильтрованных заказов
 * Создаёт виртуальные ChargeRow из данных заказов для правильного пересчёта
 */
function recalculateChargeTypeBreakdown(
  filteredOrders: AggregatedOrder[]
): Array<{
  groupName: string;
  amount: number;
  count: number;
  chargeTypes: Array<{ name: string; amount: number; count: number }>;
}> {

  // Создаём виртуальные ChargeRow из отфильтрованных заказов
  const virtualChargeRows: Array<{
    chargeType: string;
    totalAmount: number;
  }> = [];

  for (const order of filteredOrders) {
    if (!order.chargeTypes || !Array.isArray(order.chargeTypes)) {
      continue;
    }

    // Для каждого типа начисления в заказе создаём виртуальную строку
    // Распределяем суммы из заказа по типам начислений
    for (const chargeType of order.chargeTypes) {
      let amount = 0;

      // Определяем сумму начисления в зависимости от категории
      const category = getChargeCategory(chargeType);
      switch (category) {
        case "revenue":
          // Для выручки распределяем пропорционально количеству типов
          amount = (order.revenueAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "revenue"
          ).length || 1);
          break;
        case "points":
          amount = (order.pointsAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "points"
          ).length || 1);
          break;
        case "commission":
          amount = (order.commissionAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "commission"
          ).length || 1);
          break;
        case "logistics":
          amount = (order.logisticsAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "logistics"
          ).length || 1);
          break;
        case "acquiring":
          amount = (order.acquiringAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "acquiring"
          ).length || 1);
          break;
        case "returnLogistics":
        case "returnRevenue":
        case "returnCommission":
        case "returnProcessing":
          amount = (order.returnAmount || 0) / (order.chargeTypes.filter(ct => {
            const cat = getChargeCategory(ct);
            return cat === "returnLogistics" || cat === "returnRevenue" || 
                   cat === "returnCommission" || cat === "returnProcessing";
          }).length || 1);
          break;
        default:
          amount = (order.otherFeesAmount || 0) / (order.chargeTypes.filter(ct => 
            getChargeCategory(ct) === "other"
          ).length || 1);
      }

      if (Math.abs(amount) > 0.01) {
        virtualChargeRows.push({
          chargeType,
          totalAmount: amount,
        });
      }
    }
  }

  // Теперь пересчитываем breakdown на основе виртуальных chargeRows
  const groupMap = new Map<string, {
    amount: number;
    count: number;
    chargeTypes: Map<string, { amount: number; count: number }>;
  }>();

  for (const row of virtualChargeRows) {
    const chargeType = row.chargeType || "Прочее";
    const amount = row.totalAmount;
    const group = getChargeGroup(chargeType);

    if (!groupMap.has(group)) {
      groupMap.set(group, { amount: 0, count: 0, chargeTypes: new Map() });
    }

    const groupData = groupMap.get(group)!;
    groupData.amount += amount;
    groupData.count++;

    if (!groupData.chargeTypes.has(chargeType)) {
      groupData.chargeTypes.set(chargeType, { amount: 0, count: 0 });
    }

    const chargeTypeData = groupData.chargeTypes.get(chargeType)!;
    chargeTypeData.amount += amount;
    chargeTypeData.count++;
  }

  const result = Array.from(groupMap.entries())
    .map(([groupName, data]) => ({
      groupName,
      amount: data.amount,
      count: data.count,
      chargeTypes: Array.from(data.chargeTypes.entries())
        .map(([name, typeData]) => ({
          name,
          amount: typeData.amount,
          count: typeData.count,
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  return result;
}
